// عنوان الواجهة الخلفية عند تشغيل الواجهة من GitHub Pages.
// عند تشغيل الصفحة من Cloudflare Worker نفسه، تُستخدم نفس الجهة تلقائيًا.
(function () {
  if (window.SALARY_API_BASE) return;
  var host = String(location.hostname || "").toLowerCase();
  if (host.endsWith("github.io")) {
    window.SALARY_API_BASE = "https://salary-manager.alromaithi-3bo0d.workers.dev";
  } else {
    window.SALARY_API_BASE = "";
  }
})();

// Salary Manager official iCloud Shortcut templates (3.9.3 r5)
window.SALARY_BANK_SHORTCUT_URL = "https://www.icloud.com/shortcuts/4fb8157133ba4255b689afa883cb3a3c";
window.SALARY_WALLET_SHORTCUT_URL = "https://www.icloud.com/shortcuts/503d528339174d3dbf69cc09eb61169a";
