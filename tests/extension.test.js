const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const puppeteer = require("puppeteer");

const extensionPath = path.resolve(__dirname, "..");

const launch = () =>
  puppeteer.launch({
    headless: "new",
    pipe: true,
    enableExtensions: [extensionPath],
    // GitHub-hosted runners cannot start extension-enabled Chrome with its sandbox.
    // Every page request is intercepted below and served from an in-memory fixture.
    args: ["--no-sandbox"],
  });

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const openPull = async (browser, pathName = "/octocat/Hello-World/pull/1") => {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      request.respond({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><head><title>Local PR fixture</title></head><body></body></html>",
      });
    } else {
      request.abort();
    }
  });
  await page.goto("https://github.com/octocat/Hello-World/pull/1", { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector("#gh-enhancer-codex", { visible: true, timeout: 3_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#gh-enhancer-codex", { visible: true, timeout: 10_000 });
  }
  if (pathName !== "/octocat/Hello-World/pull/1") {
    await page.evaluate((nextPath) => history.replaceState({}, "", nextPath), pathName);
    await page.evaluate(() => document.dispatchEvent(new Event("turbo:load")));
  }
  return page;
};

test("manifest resources exist", () => {
  const manifest = require("../manifest.json");
  assert.equal(manifest.name, "GitHub Enhancer");
  const resources = manifest.content_scripts.flatMap(({ js = [], css = [] }) => [...js, ...css]);
  for (const resource of resources) {
    assert.ok(fs.existsSync(path.join(extensionPath, resource)), `missing: ${resource}`);
  }
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.host_permissions, undefined);
});

test("renders three ordered fixed actions without duplication", async () => {
    const page = await openPull(browser);
    await page.evaluate(() => {
      const other = document.createElement("button");
      other.dataset.s4naFloatingAction = "another-extension";
      other.textContent = "Other";
      document.getElementById("s4na-github-floating-actions").append(other);
      document.dispatchEvent(new Event("turbo:load"));
    });
    assert.equal((await page.$$("#s4na-github-floating-actions")).length, 1);
    assert.equal(await page.$eval("#s4na-github-floating-actions", (el) => getComputedStyle(el).position), "fixed");
    assert.deepEqual(
      await page.$eval("#gh-enhancer-codex", (el) => {
        const style = getComputedStyle(el);
        return { backgroundColor: style.backgroundColor, color: style.color };
      }),
      { backgroundColor: "rgb(89, 99, 110)", color: "rgb(255, 255, 255)" },
    );
    assert.deepEqual(
      await page.$$eval("[data-s4na-floating-action]", (elements) =>
        elements.map((element) => element.dataset.s4naFloatingAction),
      ),
      ["another-extension", "gh-enhancer-approve", "gh-enhancer-close", "gh-enhancer-codex"],
    );
    await page.close();
});

test("posts @codex review through the visible comment form", async () => {
    const page = await openPull(browser);
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<form action="/octocat/Hello-World/pull/1/comment?sticky=true">' +
          '<textarea name="comment[body]" style="position:fixed"></textarea>' +
          '<button id="comment-submit" type="submit" style="position:fixed" disabled>Comment</button>' +
          '<button name="comment_and_close" value="1" type="submit" style="position:fixed">Close pull request</button>' +
          "</form>",
      );
      document.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        window.__submission = {
          body: new FormData(event.currentTarget).get("comment[body]"),
          submitter: event.submitter.id,
        };
      });
      document.dispatchEvent(new Event("turbo:load"));
    });
    await page.click("#gh-enhancer-codex");
    await page.waitForFunction(() => window.__submission);
    assert.deepEqual(await page.evaluate(() => window.__submission), { body: "@codex review", submitter: "comment-submit" });
    await page.close();
});

test("does not overwrite an in-progress comment", async () => {
    const page = await openPull(browser);
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<form action="/octocat/Hello-World/pull/1/comment"><textarea name="comment[body]" style="position:fixed">draft</textarea><button type="submit" style="position:fixed">Comment</button></form>',
      );
      document.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        window.__submitted = true;
      });
      document.dispatchEvent(new Event("turbo:load"));
    });
    let alertMessage;
    page.once("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.dismiss();
    });
    await page.click("#gh-enhancer-codex");
    await page.waitForFunction(() => document.querySelector("#gh-enhancer-codex").disabled === false);
    assert.match(alertMessage, /入力中のコメント/);
    assert.equal(await page.$eval('textarea[name="comment[body]"]', (el) => el.value), "draft");
    assert.equal(await page.evaluate(() => window.__submitted), undefined);
    await page.close();
});

test("closes with the native comment_and_close submitter after confirmation", async () => {
    const page = await openPull(browser);
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<form action="/octocat/Hello-World/pull/1/comment"><textarea name="comment[body]" style="position:fixed"></textarea><button type="submit" style="position:fixed">Comment</button><button id="close-submit" name="comment_and_close" value="1" type="submit" style="position:fixed">Close pull request</button></form>',
      );
      document.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        window.__submitter = event.submitter.id;
      });
      document.dispatchEvent(new Event("turbo:load"));
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#gh-enhancer-close");
    await page.waitForFunction(() => window.__submitter);
    assert.equal(await page.evaluate(() => window.__submitter), "close-submit");
    await page.close();
});

test("approves through the visible GitHub review dialog", async () => {
    const page = await openPull(browser, "/octocat/Hello-World/pull/1/changes");
    await page.evaluate(() => {
      const opener = document.createElement("button");
      opener.textContent = "Submit review";
      opener.style.position = "fixed";
      opener.addEventListener("click", () => {
        document.body.insertAdjacentHTML(
          "beforeend",
          '<div role="dialog" style="position:fixed">' +
            '<h1>Finish your review</h1>' +
            '<textarea aria-label="Markdown value"></textarea>' +
            '<input type="radio" name="reviewEvent" value="comment" checked>' +
            '<input id="approve-radio" type="radio" name="reviewEvent" value="approve">' +
            '<button id="submit-review" type="button" disabled>' +
              '<span data-component="text">Submit review</span>' +
              '<kbd><span>command</span><span>⌘</span><span>enter</span><span>⏎</span></kbd>' +
            "</button>" +
          "</div>",
        );
        const approve = document.getElementById("approve-radio");
        const submit = document.getElementById("submit-review");
        approve.addEventListener("click", () => { submit.disabled = false; });
        submit.addEventListener("click", () => { window.__approved = approve.checked; });
      });
      document.body.append(opener);
      document.dispatchEvent(new Event("turbo:load"));
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#gh-enhancer-approve");
    await page.waitForFunction(() => window.__approved === true);
    assert.equal(await page.$eval("#approve-radio", (el) => el.checked), true);
    await page.close();
});

test("fails closed when GitHub disables approval", async () => {
    const page = await openPull(browser, "/octocat/Hello-World/pull/1/changes");
    await page.evaluate(() => {
      const opener = document.createElement("button");
      opener.textContent = "Submit review";
      opener.style.position = "fixed";
      opener.addEventListener("click", () => {
        document.body.insertAdjacentHTML(
          "beforeend",
          '<div role="dialog" style="position:fixed"><h1>Finish your review</h1><textarea aria-label="Markdown value"></textarea><input type="radio" name="reviewEvent" value="approve" disabled><button id="blocked-submit" type="button">Submit review</button></div>',
        );
        document.getElementById("blocked-submit").addEventListener("click", () => { window.__submitted = true; });
      });
      document.body.append(opener);
      document.dispatchEvent(new Event("turbo:load"));
    });
    const dialogs = [];
    page.on("dialog", async (dialog) => {
      dialogs.push({ type: dialog.type(), message: dialog.message() });
      if (dialog.type() === "confirm") await dialog.accept();
      else await dialog.dismiss();
    });
    await page.click("#gh-enhancer-approve");
    await page.waitForFunction(() => document.querySelector("#gh-enhancer-approve").disabled === false);
    assert.equal(await page.evaluate(() => window.__submitted), undefined);
    assert.match(dialogs.at(-1).message, /このPRはApproveできません/);
    await page.close();
});

test("does not submit approval with an in-progress review comment", async () => {
    const page = await openPull(browser, "/octocat/Hello-World/pull/1/changes");
    await page.evaluate(() => {
      const opener = document.createElement("button");
      opener.textContent = "Submit review";
      opener.style.position = "fixed";
      opener.addEventListener("click", () => {
        document.body.insertAdjacentHTML(
          "beforeend",
          '<div role="dialog" style="position:fixed"><h1>Finish your review</h1><textarea aria-label="Markdown value">draft review</textarea><input id="draft-approve" type="radio" name="reviewEvent" value="approve"><button id="draft-submit" type="button">Submit review</button></div>',
        );
        document.getElementById("draft-submit").addEventListener("click", () => { window.__submitted = true; });
      });
      document.body.append(opener);
      document.dispatchEvent(new Event("turbo:load"));
    });
    const dialogs = [];
    page.on("dialog", async (dialog) => {
      dialogs.push({ type: dialog.type(), message: dialog.message() });
      if (dialog.type() === "confirm") await dialog.accept();
      else await dialog.dismiss();
    });
    await page.click("#gh-enhancer-approve");
    await page.waitForFunction(() => document.querySelector("#gh-enhancer-approve").disabled === false);
    assert.equal(await page.evaluate(() => window.__submitted), undefined);
    assert.match(dialogs.at(-1).message, /入力中のレビューコメント/);
    await page.close();
});
