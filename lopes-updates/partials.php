<?php
/* peças compartilhadas pelo site e pelo painel */
function mark(): string { return trim((string) file_get_contents(__DIR__ . '/assets/ls-mark.svg')); }
const THEME_JS = "(function(){try{var t=localStorage.getItem('lopes-theme');if(!t&&matchMedia('(prefers-color-scheme: dark)').matches)t='dark';if(t)document.documentElement.dataset.theme=t}catch(e){}})()";
const TOGGLE_JS = "document.querySelectorAll('[data-theme-toggle]').forEach(function(b){b.addEventListener('click',function(){var d=document.documentElement,n=d.dataset.theme==='dark'?'light':'dark';d.dataset.theme=n;try{localStorage.setItem('lopes-theme',n)}catch(e){}})})";
