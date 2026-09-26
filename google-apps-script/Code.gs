/* global SpreadsheetApp, LockService, CacheService, PropertiesService, Utilities, ContentService */

const IDENTITY_SHEET = "Enrollment";
const SUBMISSIONS_SHEET = "Submissions";
const CONTENT_SHEET = "Content";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const request = JSON.parse(event.postData.contents);
    authenticateRequest(request);
    let result;
    switch (request.action) {
      case "claim": result = claimIdentity(request.payload); break;
      case "reserve": result = reserveAttempt(request.payload); break;
      case "complete": result = finishAttempt(request.payload, true); break;
      case "refund": result = finishAttempt(request.payload, false); break;
      case "progress": result = updateProgress(request.payload); break;
      default: return jsonResponse({ ok: false, code: "invalid_request", error: "Unknown gate action." });
    }
    return jsonResponse(Object.assign({ ok: true }, result));
  } catch (error) {
    const knownCode = error && error.gateCode ? error.gateCode : "internal_error";
    return jsonResponse({
      ok: false,
      code: knownCode,
      error: knownCode === "internal_error" ? "The attempt gate could not complete the request." : error.message,
    });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function claimIdentity(payload) {
  requireFields(payload, ["email", "googleSubject", "loginAt"]);
  const sheets = openConfiguredSheets();
  const student = findRowCaseInsensitive(sheets.enrollment, 3, payload.email);
  if (!student) gateError("not_enrolled", "This email address is not enrolled in the course.");
  if (String(student.values[4]) !== "active") gateError("disabled", "This course account is disabled.");
  const existingSubject = String(student.values[1] || "");
  if (existingSubject && existingSubject !== payload.googleSubject) {
    gateError("conflict", "This roster entry is already linked to another Google account.");
  }
  const pseudonym = String(student.values[3] || "");
  if (!pseudonym) throw new Error("The enrolled student does not have a pseudonym.");
  sheets.enrollment.getRange(student.rowNumber, 2).setValue(payload.googleSubject);
  sheets.enrollment.getRange(student.rowNumber, 10).setValue(payload.loginAt);
  SpreadsheetApp.flush();
  const maxAttempts = integerCell(student.values[5], "max_attempts");
  const attemptsConsumed = integerCell(student.values[6], "attempts_consumed");
  const reserved = student.values[7] ? 1 : 0;
  return {
    pseudonym,
    remainingAttempts: Math.max(0, maxAttempts - attemptsConsumed - reserved),
  };
}

function authenticateRequest(request) {
  if (!request || !request.timestamp || !request.nonce || !request.action || !request.payload || !request.signature) {
    gateError("invalid_request", "The signed request is incomplete.");
  }
  if (Math.abs(Date.now() - Number(request.timestamp)) > MAX_CLOCK_SKEW_MS) {
    gateError("unauthorized", "The signed request has expired.");
  }
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty("API_SECRET");
  if (!secret) throw new Error("API_SECRET is not configured in Script Properties.");
  const canonical = `${request.timestamp}.${request.nonce}.${request.action}.${JSON.stringify(request.payload)}`;
  const calculated = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(canonical, secret),
  ).replace(/=+$/, "");
  if (!constantTimeEqual(calculated, String(request.signature))) {
    gateError("unauthorized", "The request signature is invalid.");
  }
  const cache = CacheService.getScriptCache();
  const nonceKey = `nonce:${request.nonce}`;
  if (cache.get(nonceKey)) gateError("unauthorized", "The signed request has already been used.");
  cache.put(nonceKey, "1", 600);
}

function constantTimeEqual(left, right) {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index % left.length) || 0) ^ (right.charCodeAt(index % right.length) || 0);
  }
  return mismatch === 0;
}

function reserveAttempt(payload) {
  requireFields(payload, [
    "googleSubject", "submissionId", "requestKey", "examId", "scope", "mode",
    "createdAt", "promptVersion", "answerParts",
  ]);
  if (!Array.isArray(payload.answerParts) || payload.answerParts.length === 0) {
    gateError("invalid_request", "answerParts must contain at least one part.");
  }
  const sheets = openConfiguredSheets();
  const student = findRow(sheets.enrollment, 2, payload.googleSubject);
  if (!student) gateError("not_enrolled", "This Google account is not enrolled in the course.");

  const duplicate = findRow(sheets.submissions, 3, payload.requestKey);
  const maxAttempts = integerCell(student.values[5], "max_attempts");
  const attemptsConsumed = integerCell(student.values[6], "attempts_consumed");
  const activeSubmissionId = String(student.values[7] || "");
  if (duplicate) {
    if (String(duplicate.values[1]) !== String(student.values[3])) {
      gateError("conflict", "The submission request identifier is already in use.");
    }
    return {
      submissionId: String(duplicate.values[0]),
      attemptNumber: integerCell(duplicate.values[5], "attempt_number"),
      remainingAttempts: Math.max(0, maxAttempts - attemptsConsumed - (activeSubmissionId ? 1 : 0)),
      duplicate: true,
    };
  }
  if (String(student.values[4]) !== "active") gateError("disabled", "This course account is disabled.");
  if (activeSubmissionId) gateError("already_running", "A feedback submission is already in progress.");
  if (attemptsConsumed >= maxAttempts) gateError("limit_reached", "All available feedback attempts have been used.");

  const pseudonym = String(student.values[3] || "");
  if (!pseudonym) throw new Error("The enrolled student does not have a pseudonym.");
  const attemptNumber = attemptsConsumed + 1;
  const submissionRow = sheets.submissions.getLastRow() + 1;
  const contentRow = sheets.content.getLastRow() + 1;
  let submissionAppended = false;
  let contentAppended = 0;
  try {
    sheets.submissions.appendRow([
      payload.submissionId, pseudonym, payload.requestKey, "queued", "waiting",
      attemptNumber, payload.examId, payload.scope, payload.mode, payload.questionRef || "",
      payload.createdAt, payload.createdAt, payload.promptVersion, "",
    ]);
    submissionAppended = true;
    const contentValues = payload.answerParts.map((part, index) => [
      payload.submissionId, "student_answer", index + 1, String(part),
    ]);
    sheets.content.getRange(contentRow, 1, contentValues.length, 4).setValues(contentValues);
    contentAppended = contentValues.length;
    sheets.enrollment.getRange(student.rowNumber, 8).setValue(payload.submissionId);
    SpreadsheetApp.flush();
  } catch (error) {
    if (contentAppended) sheets.content.deleteRows(contentRow, contentAppended);
    if (submissionAppended) sheets.submissions.deleteRow(submissionRow);
    throw error;
  }
  return {
    submissionId: payload.submissionId,
    attemptNumber,
    remainingAttempts: Math.max(0, maxAttempts - attemptsConsumed - 1),
    duplicate: false,
  };
}

function finishAttempt(payload, consume) {
  requireFields(payload, ["googleSubject", "submissionId", "updatedAt"]);
  const sheets = openConfiguredSheets();
  const student = findRow(sheets.enrollment, 2, payload.googleSubject);
  if (!student) gateError("not_enrolled", "This Google account is not enrolled in the course.");
  const submission = findRow(sheets.submissions, 1, payload.submissionId);
  if (!submission) gateError("not_found", "The submission was not found.");

  const terminalStatus = consume ? "completed" : "refunded";
  const currentStatus = String(submission.values[3]);
  const activeSubmissionId = String(student.values[7] || "");
  if (currentStatus === terminalStatus && !activeSubmissionId) {
    return finishResponse(student, payload.submissionId);
  }
  if (activeSubmissionId !== payload.submissionId) {
    gateError("conflict", "The submission does not match the student's active reservation.");
  }

  // Write the submission first. If the script stops before the enrollment row
  // is updated, retrying sees the terminal submission plus the active
  // reservation and safely finishes the enrollment update exactly once.
  sheets.submissions.getRange(submission.rowNumber, 4).setValue(terminalStatus);
  sheets.submissions.getRange(submission.rowNumber, 5).setValue(consume ? "complete" : "refunded");
  sheets.submissions.getRange(submission.rowNumber, 12).setValue(payload.updatedAt);
  if (payload.errorReference) sheets.submissions.getRange(submission.rowNumber, 14).setValue(payload.errorReference);
  if (consume) {
    // Derive the count from durable terminal rows. If this function is stopped
    // after one cell write and retried, the same completed row cannot increment
    // the student's count twice.
    const completedCount = countCompletedAttempts(sheets.submissions, String(student.values[3]));
    sheets.enrollment.getRange(student.rowNumber, 7).setValue(
      Math.max(integerCell(student.values[6], "attempts_consumed"), completedCount),
    );
  }
  sheets.enrollment.getRange(student.rowNumber, 8).clearContent();
  SpreadsheetApp.flush();
  const refreshed = findRow(sheets.enrollment, 2, payload.googleSubject);
  return finishResponse(refreshed, payload.submissionId);
}

function countCompletedAttempts(sheet, pseudonym) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const rows = sheet.getRange(2, 2, lastRow - 1, 3).getValues();
  return rows.filter(function (row) {
    return String(row[0]) === pseudonym && String(row[2]) === "completed";
  }).length;
}

function updateProgress(payload) {
  requireFields(payload, ["submissionId", "status", "stage", "updatedAt"]);
  if (payload.status !== "queued" && payload.status !== "running") {
    gateError("invalid_request", "Progress status must be queued or running.");
  }
  const sheets = openConfiguredSheets();
  const submission = findRow(sheets.submissions, 1, payload.submissionId);
  if (!submission) gateError("not_found", "The submission was not found.");
  if (["completed", "refunded"].indexOf(String(submission.values[3])) !== -1) {
    gateError("conflict", "A terminal submission cannot return to a running state.");
  }
  sheets.submissions.getRange(submission.rowNumber, 4).setValue(payload.status);
  sheets.submissions.getRange(submission.rowNumber, 5).setValue(payload.stage);
  sheets.submissions.getRange(submission.rowNumber, 12).setValue(payload.updatedAt);
  return { submissionId: payload.submissionId };
}

function finishResponse(student, submissionId) {
  const maxAttempts = integerCell(student.values[5], "max_attempts");
  const attemptsConsumed = integerCell(student.values[6], "attempts_consumed");
  const reserved = student.values[7] ? 1 : 0;
  return {
    submissionId,
    remainingAttempts: Math.max(0, maxAttempts - attemptsConsumed - reserved),
  };
}

function openConfiguredSheets() {
  const properties = PropertiesService.getScriptProperties();
  const identityId = properties.getProperty("IDENTITY_SPREADSHEET_ID");
  const feedbackId = properties.getProperty("FEEDBACK_SPREADSHEET_ID");
  if (!identityId || !feedbackId) throw new Error("Spreadsheet IDs are not configured in Script Properties.");
  const enrollment = SpreadsheetApp.openById(identityId).getSheetByName(IDENTITY_SHEET);
  const feedback = SpreadsheetApp.openById(feedbackId);
  const submissions = feedback.getSheetByName(SUBMISSIONS_SHEET);
  const content = feedback.getSheetByName(CONTENT_SHEET);
  if (!enrollment || !submissions || !content) {
    throw new Error("Enrollment, Submissions, and Content sheets must exist before using the gate.");
  }
  return { enrollment, submissions, content };
}

function findRow(sheet, column, value) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const index = values.findIndex((row) => String(row[column - 1]) === String(value));
  return index === -1 ? null : { rowNumber: index + 2, values: values[index] };
}

function findRowCaseInsensitive(sheet, column, value) {
  const target = String(value).trim().toLowerCase();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const index = values.findIndex((row) => String(row[column - 1]).trim().toLowerCase() === target);
  return index === -1 ? null : { rowNumber: index + 2, values: values[index] };
}

function integerCell(value, name) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid integer in ${name}.`);
  return parsed;
}

function requireFields(payload, fields) {
  if (!payload || fields.some((field) => payload[field] === undefined || payload[field] === null || payload[field] === "")) {
    gateError("invalid_request", "The action payload is incomplete.");
  }
}

function gateError(code, message) {
  const error = new Error(message);
  error.gateCode = code;
  throw error;
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
