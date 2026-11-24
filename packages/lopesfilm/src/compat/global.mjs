// The one-script form: <script src="__film/compat.js"></script> gives a page window.React, ReactDOM, Remotion and FilmCompat.
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactDOM from 'react-dom';
import * as jsx from 'react/jsx-runtime';
import * as Remotion from './remotion.mjs';
import * as FilmCompat from './film.mjs';

window.React = React;
window.ReactDOM = { ...ReactDOM, ...ReactDOMClient };
window.ReactJSXRuntime = jsx;
window.Remotion = Remotion;
window.FilmCompat = FilmCompat;
window.htm = FilmCompat.html;
