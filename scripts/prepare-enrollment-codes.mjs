import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

function fail(message) {
  throw new Error(message);
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) fail("A source roster ends inside a quoted field.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.trim()));
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createCode() {
  const bytes = randomBytes(16);
  let body = "";
  for (let index = 0; index < 16; index += 1) {
    body += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return `CIVP-${body.match(/.{1,4}/g).join("-")}`;
}

function argumentsFor(flag) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag) values.push(process.argv[index + 1]);
  }
  return values.filter(Boolean);
}

async function main() {
  const sectionInputs = argumentsFor("--section");
  const output = argumentsFor("--output")[0];
  if (!sectionInputs.length || !output) {
    fail('Usage: npm run roster:prepare -- --section "Section name=/path/roster.csv" --output .data/enrollment-codes.csv');
  }
  const records = [];
  const names = new Set();
  for (const input of sectionInputs) {
    const separator = input.indexOf("=");
    if (separator < 1) fail(`Invalid --section value: ${input}`);
    const section = input.slice(0, separator).trim();
    const sourcePath = input.slice(separator + 1).trim();
    const sourceRows = csvRows((await readFile(sourcePath, "utf8")).replace(/^\uFEFF/, ""));
    for (const sourceRow of sourceRows) {
      if (sourceRow.length !== 1) fail(`${sourcePath} must contain exactly one name column.`);
      const name = sourceRow[0].trim().replace(/\s+[LCR][1-4][LCR]$/i, "").trim();
      if (!name) fail(`${sourcePath} contains an empty student name.`);
      const key = name.toLocaleLowerCase("en-US");
      if (names.has(key)) fail(`The student name ${name} appears more than once across the rosters.`);
      names.add(key);
      records.push([name, section, "", createCode(), "active", "5"]);
    }
  }
  if (process.argv.includes("--include-test-account")) {
    records.push(["Course Test Account", "Test", "", createCode(), "active", "5"]);
  }
  if (!process.argv.includes("--force")) {
    try {
      await access(output);
      fail(`${output} already exists. Refusing to replace issued access codes; pass --force only if no codes were distributed.`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  const allRows = [["name", "section", "email", "enrollment_code", "status", "max_attempts"], ...records];
  await writeFile(output, `${allRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, { mode: 0o600 });
  console.log(`Prepared ${records.length} private enrollment-code records across ${sectionInputs.length} course sections${process.argv.includes("--include-test-account") ? " plus one test account" : ""}.`);
  console.log(`Private output: ${path.resolve(output)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
