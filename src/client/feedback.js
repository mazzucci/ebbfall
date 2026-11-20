// The game's ways to the docs' feedback form (/docs/feedback/: tools/docs/copy/feedback.html, sent by site/feedback.js):
// the first page's quiet second link beside Learn more (index.html #linkFeedback) and the help sheet's
// (#helpFeedback), each passing what the form cannot know from its own page: where it came from (`from`: menu or
// game), this copy's version (`v`, the sim's build, and `c`, the last game update's commit, as the build stamp says them)
// and whether this is a touch device (`touch`). Opened in a new tab, as Learn more is.
import { $, touchUi } from './ui.js';

/** The form's address from the game's page, with the details. */
export function feedbackHref(from, build, commit, touch) {
  const q = new URLSearchParams({ from, v: build || 'dev', c: !commit || commit === 'dev' ? 'dev' : commit.slice(0, 7), touch: touch ? '1' : '0' });
  return `./docs/feedback/?${q}`;
}

/** Both links with their details (`build`: the sim's build, menu.js). */
export function initFeedbackLinks(build) {
  const commit = typeof __COMMIT__ === 'string' ? __COMMIT__ : 'dev';
  for (const [id, from] of [['linkFeedback', 'menu'], ['helpFeedback', 'game']]) {
    const a = $(id);
    if (a) a.href = feedbackHref(from, build, commit, touchUi);
  }
}
