import { h, render } from 'preact';
import { BrisaApp } from './app/brisa-app';

// i18n (sets up window.__i18n at import time, starts async init)
import './i18n';

// Component CSS (bundled by esbuild into bundle.css)
import './styles';

// Wait for i18n translations to load before rendering
void window.__i18n!.ready().then(() => {
  render(<BrisaApp />, document.getElementById('app')!);
});
