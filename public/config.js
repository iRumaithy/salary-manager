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
