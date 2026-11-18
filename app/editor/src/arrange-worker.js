import { suggestArrangement } from './arrange.js';

self.addEventListener('message', ({ data: { project, options } }) => {
  try {
    self.postMessage({ result: suggestArrangement(project, options) });
  } catch (error) {
    self.postMessage({ error: error.message || '布线整理失败。' });
  }
}, { once: true });
