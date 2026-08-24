(() => {
  const containerId = "s4na-github-floating-actions";
  const actionAttribute = "data-s4na-floating-action";

  const getContainer = () => {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      container.setAttribute("aria-label", "Pull request shortcuts");
      document.body.append(container);
    }
    return container;
  };

  const register = (button, actionName) => {
    const container = getContainer();
    button.setAttribute(actionAttribute, actionName);
    container.append(button);
    [...container.querySelectorAll(`[${actionAttribute}]`)]
      .sort((left, right) =>
        left.getAttribute(actionAttribute).localeCompare(right.getAttribute(actionAttribute), "en"),
      )
      .forEach((action) => container.append(action));
  };

  const clear = (actionPrefix) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    for (const action of container.querySelectorAll(`[${actionAttribute}]`)) {
      if (action.getAttribute(actionAttribute).startsWith(actionPrefix)) action.remove();
    }
    if (!container.querySelector(`[${actionAttribute}]`)) container.remove();
  };

  window.GhEnhancerFloatingActions = { clear, register };
})();
