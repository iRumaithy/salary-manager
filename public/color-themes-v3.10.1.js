// Personal appearance preferences never change financial or account data.
export const COLOR_THEME_KEY = 'monthlySalaryManager.colorTheme.v1';
export const COLOR_THEMES = [
  {id:'blue', label:'الأزرق الهادئ', light:['#f3f5fa','#ffffff','#24334b','#64718a','#e4e9f2','#4562d5','#354db1','#edf0ff','#f0f3ff','#d4ddf5','#263b80','#283966','#4562b8'], dark:['#101725','#192236','#e8edf9','#a4b1cb','#2b3853','#a4b7ff','#4b66d0','#273452','#1d2942','#3d4d73','#b7c5ff','#202e53','#3d53a1']},
  {id:'green', label:'الأخضر الكلاسيكي', light:['#f3efe7','#fffdf9','#173331','#60706a','#e4e2da','#14756c','#0f665e','#dff2ed','#edf7f4','#c9e2da','#123f3b','#123f3b','#0f5c55'], dark:['#0d1715','#182923','#edf5f2','#a2b5ac','#2d4038','#8bd5c5','#298477','#1c3934','#182f29','#3c5c50','#b5e6da','#123c35','#1f5b4b']},
  {id:'burgundy', label:'العنابي البرقندي', light:['#f8f1f4','#fffdfd','#402d38','#7d6471','#eadde3','#9d3c5a','#812b46','#f6e7ed','#fbf0f4','#e8c7d3','#64283f','#4c1e31','#913752'], dark:['#1b1218','#2b1d26','#f8edf3','#c6a8b8','#48303e','#eba9c0','#ae4d6b','#472a39','#36222e','#674252','#f1bfd1','#4b2032','#7b304b']},
  {id:'violet', label:'البنفسجي الليلكي', light:['#f6f3fb','#fffefe','#382e4c','#786985','#e7e0f0','#7851ad','#603c92','#efe8f8','#f6f0fc','#d9c9ed','#533579','#352552','#7752af'], dark:['#161222','#251e34','#f0eafa','#b8a9cd','#3d3152','#c5acf2','#8863bd','#3c2e54','#2f2542','#594573','#d5c0f8','#33234e','#62418e']},
  {id:'slate', label:'الأزرق الرمادي', light:['#f1f5f7','#ffffff','#2a3e49','#60717b','#dfe7ec','#426d80','#365f73','#e5eff4','#edf5f8','#c8dce5','#294c60','#203949','#4c7389'], dark:['#10191f','#1a2a33','#e7f0f5','#a4b9c5','#2d4653','#9bc9dc','#43778e','#253f4d','#1e333e','#3d6274','#bbdfed','#203b4c','#365c71']},
  {id:'sand', label:'الرملي الدافئ', light:['#f7f3ed','#fffefa','#45392d','#7c6c58','#e8dfd1','#875d2f','#785125','#f2e8d8','#faf3e8','#e4cfb1','#5e4329','#4b3929','#8c653d'], dark:['#1b1611','#2b231b','#f6efe4','#c0af96','#46392a','#dfc196','#906b3e','#473723','#352a1e','#6b5435','#ead3b2','#433021','#765233']}
];
export const THEME_VARIABLES = ['canvas','paper','ink','muted','line','teal','accent-hover','teal-soft','accent-wash','accent-line','forest','hero-start','hero-end'];
export function normalizeColorTheme(value) {
  return COLOR_THEMES.some(theme => theme.id === value) ? value : 'blue';
}
