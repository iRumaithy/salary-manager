from pathlib import Path
import re

INDEX = Path("public/index.html")
WORKER = Path("src/worker.js")
SW = Path("public/sw.js")

OLD = "3.9.6-history-payday-order-r1"
NEW = "3.9.6-automation-approval-fix-r2"

def read(path):
    return path.read_text(encoding="utf-8")

def write(path, text):
    path.write_text(text, encoding="utf-8")

def require(text, needle, label):
    if needle not in text:
        raise SystemExit("Missing anchor: " + label)

index = read(INDEX)
require(index, OLD, "3.9.6 r1 release id")
require(index, "function findAutomationCommitmentMatchLocal(item)", "commitment matcher")
require(index, "async function recordAutomationImport(item, kind, options)", "automation import")
require(index, "async function acceptAutomationImport(importId, kind, commitmentId)", "accept automation")
index = index.replace(OLD, NEW)

broken_matcher = '''        var when = automationImportDate(item);
        var date = toDateInput(when);
        var operationMonth = calendarMonthForDate(date);
        var previousMonth = shiftMonth(defaultMonth, -1);
        var latePreviousMonth = operationMonth === previousMonth;
        if (operationMonth !== defaultMonth && !latePreviousMonth) {
          if (!options.silent) showToast("يمكن اعتماد عمليات الشهر الحالي أو الشهر السابق فقط.", true);
          return false;
        }
        var monthKey = date.slice(0,7);
        var previousMonth = shiftMonth(monthKey, -1);'''

fixed_matcher = '''        var when = automationImportDate(item);
        var date = toDateInput(when);
        var monthKey = date.slice(0,7);
        var previousMonth = shiftMonth(monthKey, -1);'''

require(index, broken_matcher, "misplaced previous-month validation in commitment matcher")
index = index.replace(broken_matcher, fixed_matcher, 1)

record_anchor = '''        ensureWalletCalendarCurrent(false);
        var when = automationImportDate(item);
        var date = toDateInput(when);
        if (kind === "deposit" && automationLooksLikeSalaryLocal(item)) {'''

record_replacement = '''        ensureWalletCalendarCurrent(false);
        var when = automationImportDate(item);
        var date = toDateInput(when);
        var operationMonth = calendarMonthForDate(date);
        var previousMonth = shiftMonth(defaultMonth, -1);
        var latePreviousMonth = operationMonth === previousMonth;

        // Allow the current month and the immediately previous month only.
        if (operationMonth !== defaultMonth && !latePreviousMonth) {
          if (!options.silent) showToast("يمكن اعتماد عمليات الشهر الحالي أو الشهر السابق فقط.", true);
          return false;
        }

        if (kind === "deposit" && automationLooksLikeSalaryLocal(item)) {'''

require(index, record_anchor, "recordAutomationImport date anchor")
index = index.replace(record_anchor, record_replacement, 1)

accept_pattern = re.compile(
    r'''      async function acceptAutomationImport\(importId, kind, commitmentId\) \{
        var item = automationImports\.find\(entry => String\(entry\.id\) === String\(importId\)\);
        if \(!item\) return;
        var ok = await recordAutomationImport\(item, kind, \{ silent:false, commitmentId:String\(commitmentId \|\| ""\) \}\);
        if \(!ok\) return;
        delete automationPendingTitleOverrides\[String\(importId \|\| ""\)\];
        delete automationPendingVisualOverrides\[String\(importId \|\| ""\)\];
        await refreshAutomationPending\(true\);
        showToast\(kind === "commitment_confirmation" \? "تم تأكيد تنفيذ القسط من البنك دون خصمه مرة أخرى" : \(kind === "deposit" \? "تم اعتماد الإيداع وإضافته إلى الرصيد" : "تم اعتماد المصروف وخصمه من الرصيد"\)\);
      \}''',
    re.S,
)

accept_replacement = '''      async function acceptAutomationImport(importId, kind, commitmentId) {
        var item = automationImports.find(entry => String(entry.id) === String(importId));
        if (!item) { showToast("تعذر العثور على العملية. اضغط تحديث ثم حاول مرة أخرى.", true); return; }
        try {
          var ok = await recordAutomationImport(item, kind, { silent:false, commitmentId:String(commitmentId || "") });
          if (!ok) return;
          delete automationPendingTitleOverrides[String(importId || "")];
          delete automationPendingVisualOverrides[String(importId || "")];
          await refreshAutomationPending(true);
          showToast(kind === "commitment_confirmation" ? "تم تأكيد تنفيذ القسط من البنك دون خصمه مرة أخرى" : (kind === "deposit" ? "تم اعتماد الإيداع وإضافته إلى الرصيد" : "تم اعتماد المصروف وخصمه من الرصيد"));
        } catch (error) {
          console.error("Automation approval failed", error);
          showToast("تعذر اعتماد العملية بسبب خطأ داخلي. اضغط تحديث ثم حاول مرة أخرى.", true);
        }
      }'''

index, count = accept_pattern.subn(accept_replacement, index, count=1)
if count != 1:
    raise SystemExit("Could not replace acceptAutomationImport")

record_start = index.index("      async function recordAutomationImport(item, kind, options)")
record_end = index.index("      async function acceptAutomationImport", record_start)
record_body = index[record_start:record_end]
if "var operationMonth = calendarMonthForDate(date);" not in record_body:
    raise SystemExit("operationMonth is still missing from recordAutomationImport")
if "var latePreviousMonth = operationMonth === previousMonth;" not in record_body:
    raise SystemExit("latePreviousMonth is still missing from recordAutomationImport")

matcher_start = index.index("      function findAutomationCommitmentMatchLocal(item)")
matcher_end = index.index("      function confirmAutomationCommitment", matcher_start)
matcher_body = index[matcher_start:matcher_end]
if "options.silent" in matcher_body or "latePreviousMonth" in matcher_body:
    raise SystemExit("misplaced historical validation still exists in commitment matcher")

for needle in [
    NEW,
    'console.error("Automation approval failed", error)',
    'يمكن اعتماد عمليات الشهر الحالي أو الشهر السابق فقط.',
    'var operationMonth = calendarMonthForDate(date);'
]:
    require(index, needle, needle)

write(INDEX, index)

worker = read(WORKER)
require(worker, 'const VERSION = "3.9.6";', "worker version 3.9.6")
require(worker, 'const RELEASE_ID = "' + OLD + '";', "worker r1 release")
worker = worker.replace(
    'const RELEASE_ID = "' + OLD + '";',
    'const RELEASE_ID = "' + NEW + '";',
    1
)
worker, n = re.subn(
    r'const UPDATE_SIGNAL_VERSION = "3\.9\.6[^"]*";',
    lambda _: 'const UPDATE_SIGNAL_VERSION = "3.9.6' + chr(0x2068) + '";',
    worker,
    count=1
)
if n != 1:
    raise SystemExit("Could not bump update signal")
write(WORKER, worker)

sw = read(SW)
require(sw, "salary-manager-v3.9.6-history-payday-order-r1", "sw r1 cache")
sw = sw.replace(
    "salary-manager-v3.9.6-history-payday-order-r1",
    "salary-manager-v3.9.6-automation-approval-fix-r2",
    1
)
write(SW, sw)

print("3.9.6 r2 automation approval fix applied")
