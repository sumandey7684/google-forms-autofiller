import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Google Form AutoFiller',
  description:
    'Foundation for filling Google Forms using a saved profile, question matching, and optional AI answers. Manual submit only.',
  version: '0.1.0',
  action: {
    default_title: 'Google Form AutoFiller',
    default_popup: 'src/popup/index.html',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: [
        'https://docs.google.com/forms/*',
        'https://forms.gle/*',
      ],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'activeTab'],
  host_permissions: [
    'https://docs.google.com/forms/*',
    'https://forms.gle/*',
  ],
});
