(() => {
  const pullPathPattern = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/(changes|commits|checks))?\/?$/;

  const isVisible = (element) => {
    if (!element) return false;
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return (
      element.getClientRects().length > 0 &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse"
    );
  };

  const oneVisible = (elements) => {
    const visible = [...elements].filter(isVisible);
    return visible.length === 1 ? visible[0] : null;
  };

  const getPull = () => {
    const match = location.pathname.match(pullPathPattern);
    if (!match) return null;
    return { owner: match[1], repository: match[2], number: match[3], tab: match[4] ?? "conversation" };
  };

  const getCommentForm = () => {
    const pull = getPull();
    if (!pull) return null;
    const forms = [...document.querySelectorAll("form")].filter((form) => {
      const action = new URL(form.action, location.href);
      const validAction =
        action.pathname === `/${pull.owner}/${pull.repository}/pull/${pull.number}/comment` ||
        action.pathname === `/${pull.owner}/${pull.repository}/issues/${pull.number}/comments`;
      return validAction && oneVisible(form.querySelectorAll('textarea[name="comment[body]"]'));
    });
    return forms.length === 1 ? forms[0] : null;
  };

  const getEmptyCommentTextarea = (form) => {
    const textarea = oneVisible(form?.querySelectorAll('textarea[name="comment[body]"]') ?? []);
    return textarea && !textarea.value.trim() ? textarea : null;
  };

  const buttonText = (button) => (button.innerText || button.value || "").trim().replace(/\s+/g, " ");

  window.GhEnhancerDom = {
    buttonText,
    getCommentForm,
    getEmptyCommentTextarea,
    getPull,
    isVisible,
    oneVisible,
  };
})();
