/**
 * 2.9.1 — דף שמתקן את עצמו כשקובץ קוד לא נטען.
 *
 * הרקע (16-17.11.2026): מיד אחרי עליית גרסה, דפדפן שביקש קובץ JS חדש ברגע המעבר
 * קיבל 404 — והתשובה הזו נשמרת בדפדפן לשנה (cache-control: immutable חל על כל
 * /assets/*, גם על 404). מאותו רגע הדף נטען בלי הקוד שלו: נראה תקין, אבל שום כפתור
 * לא מגיב ("כניסה עם Google" לא עושה כלום). אותו דבר קורה לטאב ישן ששוחזר עם HTML
 * של גרסה קודמת, שמפנה לקבצים שכבר לא קיימים.
 *
 * הסקריפט רץ בתוך ה-<head>, לפני כל קוד אחר. כשקובץ מ-/assets/ נכשל בטעינה הוא
 * מושך אותו מחדש מהרשת (cache: "reload" — מחליף את התשובה השמורה) ומרענן את הדף.
 * לכל היותר 3 ניסיונות לטאב, כדי שלא תיווצר לולאת רענונים כשהקובץ באמת חסר.
 * קובץ העיצוב וה-modulepreload נטענים לפני הסקריפט (React מקפיץ אותם לראש ה-<head>),
 * ולכן בנוסף להאזנה לשגיאות נסרקות גם הטעינות שכבר הסתיימו (Resource Timing): קובץ
 * מ-/assets/ שחזר עם סטטוס 400 ומעלה מטופל באותה דרך.
 *
 * מחרוזת ES5 פשוטה בכוונה: היא חייבת לרוץ גם כששאר הקוד לא נטען.
 */
export const ASSET_HEAL_SCRIPT = `(function(){
var KEY="hk_asset_heal",MAX=3,queue=[],timer=null,pending=false;
function count(){try{return parseInt(sessionStorage.getItem(KEY)||"0",10)||0}catch(e){return MAX}}
function bump(){try{sessionStorage.setItem(KEY,String(count()+1))}catch(e){}}
function isAsset(u){return typeof u==="string"&&u.indexOf("/assets/")!==-1}
function run(){
timer=null;var urls=queue.slice();queue=[];
if(count()>=MAX){pending=false;return}
bump();
if(!urls.length){location.reload();return}
var done=0;function finish(){done++;if(done>=urls.length)location.reload()}
for(var i=0;i<urls.length;i++){try{fetch(urls[i],{cache:"reload"}).then(finish,finish)}catch(e){finish()}}
}
function heal(u){
if(isAsset(u)&&queue.indexOf(u)===-1)queue.push(u);
pending=true;if(!timer)timer=setTimeout(run,250);
}
window.addEventListener("error",function(e){
var t=e&&e.target;
if(t&&t!==window&&(t.tagName==="SCRIPT"||t.tagName==="LINK")){var u=t.src||t.href;if(isAsset(u))heal(u)}
},true);
window.addEventListener("vite:preloadError",function(e){
var m=(e&&e.payload&&e.payload.message)||"";var u=(m.match(/https?:\\/\\/[^\\s'"]+/)||[])[0];
if(e&&e.preventDefault)e.preventDefault();heal(u);
});
window.addEventListener("unhandledrejection",function(e){
var m=(e&&e.reason&&e.reason.message)||"";
if(/dynamically imported module|Importing a module script failed/i.test(m)){var u=(m.match(/https?:\\/\\/[^\\s'"]+/)||[])[0];heal(u)}
});
function scan(){try{var es=performance.getEntriesByType("resource");for(var j=0;j<es.length;j++){if(isAsset(es[j].name)&&es[j].responseStatus>=400)heal(es[j].name)}}catch(e){}}
scan();
window.addEventListener("load",function(){scan();setTimeout(function(){if(!pending){try{sessionStorage.removeItem(KEY)}catch(e){}}},10000)});
})();`;
