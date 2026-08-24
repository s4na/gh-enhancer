(() => {
  const applicationName = "gh-enhancer";
  const pendingKey = "s4na-gh-enhancer-pending-action";
  const pendingLifetimeMs = 30_000;
  const { buttonText, getCommentForm, getEmptyCommentTextarea, getPull, isVisible, oneVisible } =
    window.GhEnhancerDom;
  const { clear, register } = window.GhEnhancerFloatingActions;

  const alertFailure = (message) => alert(`操作を実行できませんでした。${message}`);

  const setBusy = (button, busy) => {
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
  };

  const isDisabled = (element) =>
    element.disabled || element.getAttribute("aria-disabled") === "true";

  const routeFor = (pull, action) => {
    const base = `/${pull.owner}/${pull.repository}/pull/${pull.number}`;
    return action === "approve" ? `${base}/changes` : base;
  };

  const continueOnRequiredTab = (action) => {
    const pull = getPull();
    if (!pull) return false;
    const target = routeFor(pull, action);
    if (location.pathname.replace(/\/$/, "") === target) return false;
    sessionStorage.setItem(pendingKey, JSON.stringify({ action, target, createdAt: Date.now() }));
    location.assign(target);
    return true;
  };

  const insertText = (textarea, value) => {
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand("insertText", false, value);
  };

  const postCodexComment = () => {
    if (continueOnRequiredTab("codex")) return;
    const form = getCommentForm();
    if (!form) return alertFailure("GitHubのコメントフォームが見つかりません。");
    const textarea = getEmptyCommentTextarea(form);
    if (!textarea) return alertFailure("入力中のコメントがあるため中止しました。");
    const submitter = oneVisible(
      form.querySelectorAll(
        'button[type="submit"]:not([name="comment_and_close"]):not([name="comment_and_reopen"]), input[type="submit"]:not([name="comment_and_close"]):not([name="comment_and_reopen"])',
      ),
    );
    if (!submitter) return alertFailure("コメント投稿ボタンを一意に特定できません。");
    if (!insertText(textarea, "@codex")) return alertFailure("コメント欄に入力できません。");
    form.requestSubmit(submitter);
  };

  const closePullRequest = () => {
    const pull = getPull();
    if (!pull) return;
    if (continueOnRequiredTab("close")) return;
    if (!confirm(`${pull.owner}/${pull.repository} #${pull.number} をCloseしますか？`)) return;
    const form = getCommentForm();
    if (!form) return alertFailure("GitHubのコメントフォームが見つかりません。");
    if (!getEmptyCommentTextarea(form)) {
      return alertFailure("入力中のコメントがあるためCloseしませんでした。");
    }
    const submitter = oneVisible(form.querySelectorAll('[name="comment_and_close"][type="submit"]'));
    if (!submitter) return alertFailure("Close pull requestボタンを一意に特定できません。");
    form.requestSubmit(submitter);
  };

  const waitForReviewDialog = () =>
    new Promise((resolve) => {
      const find = () =>
        [...document.querySelectorAll('[role="dialog"]')].find(
          (dialog) => isVisible(dialog) && /Finish your (review|comments)/i.test(dialog.innerText),
        );
      const current = find();
      if (current) return resolve(current);
      const observer = new MutationObserver(() => {
        const dialog = find();
        if (!dialog) return;
        observer.disconnect();
        resolve(dialog);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, 3_000);
    });

  const waitUntilEnabled = (button) =>
    new Promise((resolve) => {
      if (!isDisabled(button)) return resolve(true);
      const observer = new MutationObserver(() => {
        if (isDisabled(button)) return;
        observer.disconnect();
        resolve(true);
      });
      observer.observe(button, { attributes: true, attributeFilter: ["disabled", "aria-disabled"] });
      setTimeout(() => {
        observer.disconnect();
        resolve(!isDisabled(button));
      }, 2_000);
    });

  const approvePullRequest = async () => {
    const pull = getPull();
    if (!pull) return;
    if (continueOnRequiredTab("approve")) return;
    if (!confirm(`${pull.owner}/${pull.repository} #${pull.number} をApproveしますか？`)) return;

    const openReview = oneVisible(
      [...document.querySelectorAll("button")].filter(
        (button) => buttonText(button) === "Submit review",
      ),
    );
    if (!openReview) return alertFailure("Submit reviewボタンを一意に特定できません。");
    openReview.click();

    const dialog = await waitForReviewDialog();
    if (!dialog) return alertFailure("Reviewダイアログを確認できません。");
    const approve = oneVisible(
      dialog.querySelectorAll('input[type="radio"][name="reviewEvent"][value="approve"]'),
    );
    if (!approve || isDisabled(approve)) {
      return alertFailure("このPRはApproveできません。権限やPRの状態を確認してください。");
    }
    const reviewTextarea = oneVisible(dialog.querySelectorAll('textarea[aria-label="Markdown value"]'));
    if (!reviewTextarea) {
      return alertFailure("レビューコメント欄を一意に特定できません。");
    }
    if (reviewTextarea.value.trim()) {
      return alertFailure("入力中のレビューコメントがあるためApproveしませんでした。");
    }
    approve.click();
    const submitReview = oneVisible(
      [...dialog.querySelectorAll("button")].filter((button) => /^Submit review$/.test(buttonText(button))),
    );
    if (!submitReview || !(await waitUntilEnabled(submitReview))) {
      return alertFailure("Review送信ボタンを有効な状態で特定できません。");
    }
    submitReview.click();
  };

  const actions = [
    { name: `${applicationName}-approve`, id: "gh-enhancer-approve", label: "Approve", variant: "approve", run: approvePullRequest },
    { name: `${applicationName}-close`, id: "gh-enhancer-close", label: "Close PR", variant: "danger", run: closePullRequest },
    { name: `${applicationName}-codex`, id: "gh-enhancer-codex", label: "@codex", variant: "default", run: postCodexComment },
  ];

  const render = () => {
    clear(applicationName);
    if (!getPull()) return;
    for (const action of actions) {
      const button = document.createElement("button");
      button.id = action.id;
      button.type = "button";
      button.className = `s4na-gh-enhancer-button s4na-gh-enhancer-button--${action.variant}`;
      button.textContent = action.label;
      button.setAttribute("aria-label", action.label);
      button.addEventListener("click", async () => {
        setBusy(button, true);
        try {
          await action.run();
        } finally {
          if (button.isConnected) setBusy(button, false);
        }
      });
      register(button, action.name);
    }
  };

  const resumePendingAction = () => {
    const raw = sessionStorage.getItem(pendingKey);
    if (!raw) return;
    sessionStorage.removeItem(pendingKey);
    try {
      const pending = JSON.parse(raw);
      if (Date.now() - pending.createdAt > pendingLifetimeMs || location.pathname !== pending.target) return;
      const action = actions.find((candidate) => candidate.name === `${applicationName}-${pending.action}`);
      setTimeout(() => action?.run(), 0);
    } catch {
      // Ignore invalid or stale session state.
    }
  };

  const initialize = () => {
    render();
    resumePendingAction();
  };

  initialize();
  document.addEventListener("turbo:load", initialize);
  document.addEventListener("pjax:end", initialize);
})();
