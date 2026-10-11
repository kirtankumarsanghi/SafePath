import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafePath — Floor-plan evacuation planning",
  description: "Upload a building plan, review doors and exits, and explore candidate routes with the A* search algorithm.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/site.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try {
    var origConsoleError = window.console.error;
    window.console.error = function() {
      var msg = '';
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        if (typeof arg === 'string') msg += ' ' + arg;
        else if (arg && arg.message) msg += ' ' + arg.message;
        else if (arg && arg.stack) msg += ' ' + arg.stack;
      }
      if (
        (msg.indexOf('hydrat') !== -1 || msg.indexOf('Hydrat') !== -1) &&
        (msg.indexOf('bis_skin_checked') !== -1 ||
         msg.indexOf('crxemulator') !== -1 ||
         msg.indexOf('chrome-extension://') !== -1 ||
         msg.indexOf('bis_register') !== -1 ||
         msg.indexOf('browser extension') !== -1)
      ) {
        return;
      }
      return origConsoleError.apply(this, arguments);
    };
  } catch (_) {}
  try {
    var clean = function(el) {
      if (!el || !el.removeAttribute) return;
      if (el.hasAttribute && el.hasAttribute('bis_skin_checked')) el.removeAttribute('bis_skin_checked');
      if (el.hasAttribute && el.hasAttribute('bis_register')) el.removeAttribute('bis_register');
      if (el.hasAttribute && el.hasAttribute('crxemulator')) el.removeAttribute('crxemulator');
      if (el.hasAttribute && el.hasAttribute('crxemulator-bridged')) el.removeAttribute('crxemulator-bridged');
    };
    var obs = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        clean(mutations[i].target);
      }
    });
    obs.observe(document.documentElement, { attributes: true, subtree: true });
  } catch (_) {}
  try {
    var origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(k, v) {
      if (typeof k === 'string' && (k.indexOf('bis_') === 0 || k.indexOf('crxemulator') === 0 || k.indexOf('__processed_') === 0)) {
        return;
      }
      return origSetAttr.apply(this, arguments);
    };
  } catch (_) {}
  document.addEventListener('click',function(e){
    if(e.__handledByReact) return;
    var btn=e.target&&e.target.closest('#site-menu-button');
    if(btn){
      var menu=document.getElementById('site-menu');
      if(!menu) return;
      var open=btn.getAttribute('aria-expanded')==='true';
      var next=!open;
      btn.setAttribute('aria-expanded',String(next));
      btn.setAttribute('aria-label',next?'Close menu':'Open menu');
      menu.hidden=!next;
      if(next){
        document.body.style.overflow='hidden';
        var first=menu.querySelector('a');
        if(first) first.focus();
      }else{
        document.body.style.overflow='';
        btn.focus();
      }
      window.dispatchEvent(new CustomEvent('safepath-menu-toggle',{detail:next}));
      return;
    }
    var menu=document.getElementById('site-menu');
    if(menu&&!menu.hidden&&e.target===menu){
      var b=document.getElementById('site-menu-button');
      menu.hidden=true;
      if(b){
        b.setAttribute('aria-expanded','false');
        b.setAttribute('aria-label','Open menu');
        b.focus();
      }
      document.body.style.overflow='';
      window.dispatchEvent(new CustomEvent('safepath-menu-toggle',{detail:false}));
    }
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      var menu=document.getElementById('site-menu');
      var btn=document.getElementById('site-menu-button');
      if(menu&&!menu.hidden){
        e.preventDefault();
        menu.hidden=true;
        if(btn){
          btn.setAttribute('aria-expanded','false');
          btn.setAttribute('aria-label','Open menu');
          btn.focus();
        }
        document.body.style.overflow='';
        window.dispatchEvent(new CustomEvent('safepath-menu-toggle',{detail:false}));
      }
    }
  });
})();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
