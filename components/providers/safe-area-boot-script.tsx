const SCRIPT = `(function(){try{var raw=localStorage.getItem("manavi-safe-area:v1");if(!raw)return;var vars=JSON.parse(raw);var style=document.documentElement.style;for(var key in vars){if(key.indexOf("--tg-")===0)style.setProperty(key,vars[key]);}}catch(e){}})();`;

export function SafeAreaBootScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}