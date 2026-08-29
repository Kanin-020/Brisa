/** @jsx h */
import { h, render } from 'preact';
import { BrisaApp } from './app/brisa-app.jsx';

// Component CSS (bundled by esbuild into bundle.css)
import './styles.js';

// Render the app into the #app root
render(<BrisaApp />, document.getElementById('app'));
