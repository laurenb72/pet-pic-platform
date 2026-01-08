// === Azure Logic App endpoints & storage account ===
const IUPS =
  "https://prod-10.norwayeast.logic.azure.com:443/workflows/20cb86a3d7d64b1dbc8ce639d07afd65/triggers/When_an_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig=R1virOShkpLr0YPwezQ3rrjM9U5OVidhSdgvhrYP9Ao";

const RAI =
  "https://prod-23.norwayeast.logic.azure.com:443/workflows/1b00dcd8679f47b4b14ce9af6f1ac5fb/triggers/When_an_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig=rk0cDtAhPuaCElRJ77QgJ51Eu6hCAmJgGaVPvjpOEpc";

// Template URLs (keep {userID}/{id} encoded style)
const RIA_TEMPLATE =
  "https://prod-18.norwayeast.logic.azure.com/workflows/5ba7e57e5cd24a28861796a1647e434b/triggers/When_an_HTTP_request_is_received/paths/invoke/api/assets/%7BuserID%7D/%7Bid%7D?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig=wEHFquteGwE9Htj_unQTMvPfGdnMJH8S7EYfeeLX_Cg";

const UIA_TEMPLATE =
  "https://prod-21.norwayeast.logic.azure.com/workflows/2dcf07ade9604158943fb4531cc5f9f3/triggers/When_an_HTTP_request_is_received/paths/invoke/api/assets/%7BuserID%7D/%7Bid%7D?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig=bitWJ4KC3JH0C4yOuAx8rBMfsVFbakz9AvTLMxUgg24";

const DIA_TEMPLATE =
  "https://prod-06.norwayeast.logic.azure.com/workflows/30149233d96642a78d015d97ce51aa02/triggers/When_an_HTTP_request_is_received/paths/invoke/api/assets/%7BuserID%7D/%7Bid%7D?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig=PivnmPm0hijLJ-vWv33N96vi_jIhr0_f9Jzajt-tEUw";

// OPTIONAL fallback (if you ever switch public again, or for debugging)
const BLOB_ACCOUNT = "https://petpicmedia.blob.core.windows.net";

// ✅ YOUR FUNCTION URL (GetSas → Get function URL)
const GETSAS_ENDPOINT = window.PETPIC_GETSAS_ENDPOINT || "";

// Cache SAS URLs (session)
const sasCache = new Map(); // key: filePath, value: { sasUrl, expiresOn }

// Keep currently-open post
let currentDetail = null; // { userID, id, filePath, doc }

// === jQuery handlers ===
$(document).ready(function () {
  // Nav
  $("#navFeed").click((e) => { e.preventDefault(); navigateToFeed(); });
  $("#navProfile").click((e) => { e.preventDefault(); navigateToProfile(); });
  $("#navBrand").click((e) => { e.preventDefault(); navigateToFeed(); });

  // Feed actions
  $("#retPosts").click(getPosts);

  // Create post (now on profile)
  $("#subNewForm").click(submitNewPost);
  $("#clearNewForm").click(clearCreateForm);

  // Search
  $("#btnSearchPost").click(searchPost);
  $("#btnClearSearch").click(clearSearch);

  // Click a card => open detail
  $(document).on("click", ".media-card", function (e) {
    // Prevent accidental open if user is selecting text
    if (window.getSelection && String(window.getSelection()).length > 0) return;

    const userID = $(this).data("userid");
    const id = $(this).data("id");
    if (!userID || !id) return;

    navigateToDetail(userID, id);
  });

  // Detail view buttons
  $("#btnBackToFeed").click((e) => { e.preventDefault(); history.back(); });
  $("#btnCancelEdit").click(() => { history.back(); });
  $("#btnSaveEdit").click(saveDetailEdits);
  $("#btnDeletePost").click(deleteFromDetail);

  // Back/forward support
  window.addEventListener("popstate", handlePopState);

  // Initial load -> feed
  navigateToFeed(true);
});

// === Navigation helpers ===
function setActive(which){
  $("#navFeed").toggleClass("active", which === "feed");
  $("#navProfile").toggleClass("active", which === "profile");

  $("#pageFeed").toggle(which === "feed");
  $("#pageProfile").toggle(which === "profile");
  $("#pageDetail").toggle(which === "detail");
}

function navigateToFeed(isInitial = false){
  setActive("feed");
  if (!isInitial) history.pushState({ page: "feed" }, "", "#feed");

  // Auto-load posts whenever we arrive at feed
  getPosts();
}

function navigateToProfile(){
  setActive("profile");
  history.pushState({ page: "profile" }, "", "#profile");
}

function navigateToDetail(userID, id){
  setActive("detail");
  history.pushState({ page: "detail", userID, id }, "", `#post/${encodeURIComponent(userID)}/${encodeURIComponent(id)}`);
  loadPostDetail(userID, id);
}

function handlePopState(){
  // Decide based on hash
  const h = location.hash || "#feed";

  if (h.startsWith("#post/")){
    const parts = h.replace("#post/","").split("/");
    const userID = decodeURIComponent(parts[0] || "");
    const id = decodeURIComponent(parts[1] || "");
    setActive("detail");
    loadPostDetail(userID, id);
    return;
  }

  if (h === "#profile"){
    setActive("profile");
    return;
  }

  // default
  setActive("feed");
  getPosts();
}

// === Create post (upload) ===
function submitNewPost() {
  const file = $("#UpFile")[0].files[0];
  const caption = $("#FileName").val();
  const tagsRaw = $("#Tags").val();

  const submitData = new FormData();
  submitData.append("FileName", caption);
  submitData.append("Tags", tagsRaw);
  submitData.append("userID", $("#userID").val());
  submitData.append("userName", $("#userName").val());
  submitData.append("File", file);

  $("#createStatus").text("");

  if (!caption || !$("#userID").val() || !$("#userName").val() || !file) {
    $("#createStatus").text("Please complete all fields and choose a file.").css("color", "#b91c1c");
    return;
  }

  $("#subNewForm").prop("disabled", true).text("Creating...");

  $.ajax({
    url: IUPS,
    data: submitData,
    cache: false,
    enctype: "multipart/form-data",
    contentType: false,
    processData: false,
    type: "POST",
    success: () => {
      $("#createStatus").text("Post created ✅").css("color", "#065f46");
      // Go back to feed and refresh so they see it immediately
      navigateToFeed();
    },
    error: (xhr, status, err) => {
      console.error("Upload failed:", status, err, xhr?.responseText);
      $("#createStatus").text("Create failed — check console.").css("color", "#b91c1c");
      alert("Create failed — see console for details.");
    },
    complete: () => {
      $("#subNewForm").prop("disabled", false).text("Create Post");
    }
  });
}

function clearCreateForm(){
  $("#FileName").val("");
  $("#Tags").val("");
  $("#userID").val("");
  $("#userName").val("");
  $("#UpFile").val("");
  $("#createStatus").text("");
}

// === Retrieve and render posts list ===
function getPosts() {
  const $list = $("#PostList");
  $("#postsStatus").text("Loading...");

  $list
    .addClass("media-grid")
    .html('<div class="spinner-border" role="status"><span>Loading...</span></div>');

  $.ajax({
    url: RAI,
    type: "GET",
    dataType: "json",
    success: async function (data) {
      const items = Array.isArray(data) ? data : (Array.isArray(data?.value) ? data.value : []);

      if (!items.length) {
        $("#postsStatus").text("0 posts found.");
        $list.html('<h4 class="muted" style="text-align:center;">No posts found yet. Go to My Profile to create one.</h4>');
        return;
      }

      $("#postsStatus").text(`${items.length} post(s) loaded.`);

      const cards = [];
      $.each(items, function (_, val) {
        cards.push(buildPostCard(val));
      });

      $list.html(cards.join(""));

      // Hydrate SAS URLs
      await hydrateSasForCards($list);
    },
    error: (xhr, status, error) => {
      console.error("Error fetching posts:", status, error, xhr?.responseText);
      $("#postsStatus").text("Error loading posts.");
      $list.html("<p style='color:red;'>Error loading posts. Check console.</p>");
    },
  });
}

// Build clickable post card (NO edit/delete here now)
function buildPostCard(val){
  try {
    let fileName = unwrapMaybeBase64(val.fileName || val.FileName || "");
    let filePath = unwrapMaybeBase64(val.filePath || val.FilePath || "");
    let userName = unwrapMaybeBase64(val.userName || val.UserName || "");
    let userID   = unwrapMaybeBase64(val.userID   || val.UserID   || "");
    let id       = unwrapMaybeBase64(val.id       || val.Id       || "");

    const tagsVal = val.tags || val.Tags || [];
    const tags = Array.isArray(tagsVal) ? tagsVal : String(tagsVal || "").split(",").map(t => t.trim()).filter(Boolean);
    const tagsLine = tags.length ? `<div class="meta-line">Tags: ${escapeHtml(tags.join(", "))}</div>` : "";

    const contentType = val.contentType || val.ContentType || "";
    const isVideo = isLikelyVideo({ contentType, url: filePath, fileName });

    const dataAttrs =
      `data-userid="${escapeHtml(userID)}" data-id="${escapeHtml(id)}" data-filepath="${escapeHtml(filePath)}"`;

    const safeLabel = escapeHtml(fileName || (isVideo ? "(video)" : "(image)"));

    if (isVideo) {
      return `
        <div class="media-card" ${dataAttrs} title="Click to open post">
          <div class="media-thumb">
            <div class="muted" style="font-weight:800;">Video post</div>
          </div>
          <div class="media-body">
            <span class="media-title">${safeLabel}</span>
            ${tagsLine}
            <div class="meta-line">Uploaded by: ${escapeHtml(userName || "(unknown)")} (id: ${escapeHtml(userID || "(unknown)")})</div>
            <div class="meta-line">Post id: ${escapeHtml(id || "(missing)")}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="media-card" ${dataAttrs} title="Click to open post">
        <div class="media-thumb">
          <img class="js-sas-img" src="" alt="${safeLabel}" data-label="${safeLabel}" />
        </div>
        <div class="media-body">
          <span class="media-title">${safeLabel}</span>
          ${tagsLine}
          <div class="meta-line">Uploaded by: ${escapeHtml(userName || "(unknown)")} (id: ${escapeHtml(userID || "(unknown)")})</div>
          <div class="meta-line">Post id: ${escapeHtml(id || "(missing)")}</div>
          <div class="image-error"></div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Error building card:", err, val);
    return `
      <div class="media-card">
        <div class="media-body">
          <span class="media-title" style="color:#b91c1c;">Error displaying this post</span>
        </div>
      </div>
    `;
  }
}

// === Post Detail ===
function loadPostDetail(userID, id){
  $("#detailStatus").text("Loading...");
  $("#editStatus").text("");
  $("#deleteStatus").text("");
  $("#detailMedia").html(`<span class="muted">Loading media…</span>`);
  $("#detailMeta").text("");

  currentDetail = { userID, id, filePath: "", doc: null };

  const url = buildUrlFromTemplate(RIA_TEMPLATE, userID, id);

  $.ajax({
    url,
    type: "GET",
    dataType: "json",
    success: async function(data){
      const doc = Array.isArray(data?.value) ? data.value[0] : data;
      if (!doc){
        $("#detailStatus").text("Post not found.");
        $("#detailMedia").html(`<span class="muted">No data</span>`);
        return;
      }

      currentDetail.doc = doc;

      const fileName = unwrapMaybeBase64(doc.fileName || doc.FileName || "");
      const filePath = unwrapMaybeBase64(doc.filePath || doc.FilePath || "");
      const userName = unwrapMaybeBase64(doc.userName || doc.UserName || "");
      const tagsVal = doc.tags || doc.Tags || [];
      const tagsArr = Array.isArray(tagsVal) ? tagsVal : String(tagsVal || "").split(",").map(t => t.trim()).filter(Boolean);

      currentDetail.filePath = filePath;

      $("#detailStatus").text("Loaded ✅");

      // Prefill edit form
      $("#editCaption").val(fileName || "");
      $("#editTags").val(tagsArr.join(", "));

      // Meta
      $("#detailMeta").html(`
        <div><strong>Caption:</strong> ${escapeHtml(fileName || "(none)")}</div>
        <div><strong>Uploaded by:</strong> ${escapeHtml(userName || "(unknown)")} (userID: ${escapeHtml(userID)})</div>
        <div><strong>Post id:</strong> ${escapeHtml(id)}</div>
      `);

      // Render media (image/video)
      const contentType = doc.contentType || doc.ContentType || "";
      const isVideo = isLikelyVideo({ contentType, url: filePath, fileName });

      if (isVideo){
        // For videos: show a button link once SAS is fetched
        $("#detailMedia").html(`
          <div style="text-align:center;">
            <div class="muted" style="margin-bottom:10px; font-weight:800;">Video post</div>
            <a class="btn btn-petpic" id="detailVideoLink" href="#" target="_blank" rel="noopener">Open Video</a>
          </div>
        `);

        const sasUrl = await getSasUrl(filePath);
        $("#detailVideoLink").attr("href", sasUrl);
      } else {
        // Image
        $("#detailMedia").html(`
          <img id="detailImg" src="" alt="${escapeHtml(fileName || "image")}" />
        `);

        const sasUrl = await getSasUrl(filePath);
        $("#detailImg").attr("src", sasUrl);
      }
    },
    error: function(xhr, status, err){
      console.error("Load detail failed:", status, err, xhr?.responseText);
      $("#detailStatus").text("Failed to load.");
      $("#detailMedia").html(`<span class="muted">Error loading media</span>`);
    }
  });
}

function saveDetailEdits(){
  if (!currentDetail?.userID || !currentDetail?.id){
    $("#editStatus").text("No post loaded.").css("color", "#b91c1c");
    return;
  }

  const userID = currentDetail.userID;
  const id = currentDetail.id;

  const newCaption = $("#editCaption").val().trim();
  const tagsArray = String($("#editTags").val() || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  if (!newCaption){
    $("#editStatus").text("Caption cannot be empty.").css("color", "#b91c1c");
    return;
  }

  $("#btnSaveEdit").prop("disabled", true).text("Saving...");

  const putUrl = buildUrlFromTemplate(UIA_TEMPLATE, userID, id);

  const payload = {
    id: id,
    userID: userID,
    fileName: newCaption,
    tags: tagsArray
  };

  $.ajax({
    url: putUrl,
    type: "PUT",
    contentType: "application/json",
    data: JSON.stringify(payload),
    success: function(){
      $("#editStatus").text("Updated ✅").css("color", "#065f46");
      // Refresh feed in background so when you go back it’s updated
      getPosts();
      // Update meta shown
      $("#detailMeta").find("div").first().html(`<strong>Caption:</strong> ${escapeHtml(newCaption)}`);
    },
    error: function(xhr, status, err){
      console.error("Update failed:", status, err, xhr?.responseText);
      $("#editStatus").text("Update failed — check console.").css("color", "#b91c1c");
    },
    complete: function(){
      $("#btnSaveEdit").prop("disabled", false).text("Save Changes");
    }
  });
}

function deleteFromDetail(){
  if (!currentDetail?.userID || !currentDetail?.id){
    $("#deleteStatus").text("No post loaded.").css("color", "#b91c1c");
    return;
  }

  const userID = currentDetail.userID;
  const id = currentDetail.id;

  if (!confirm(`Delete this post?\nuserID: ${userID}\nid: ${id}`)) return;

  $("#btnDeletePost").prop("disabled", true).text("Deleting...");

  const url = buildUrlFromTemplate(DIA_TEMPLATE, userID, id);

  $.ajax({
    url,
    type: "DELETE",
    success: function(){
      $("#deleteStatus").text("Deleted ✅").css("color", "#065f46");
      // Go back to feed and refresh
      navigateToFeed();
    },
    error: function(xhr, status, err){
      console.error("Delete failed:", status, err, xhr?.responseText);
      $("#deleteStatus").text("Delete failed — check console.").css("color", "#b91c1c");
    },
    complete: function(){
      $("#btnDeletePost").prop("disabled", false).text("Delete this post");
    }
  });
}

// === Search (retrieve one) ===
function searchPost(){
  const userID = $("#searchUserID").val().trim();
  const id = $("#searchId").val().trim();

  $("#searchStatus").text("");
  $("#SearchResult").empty();

  if (!userID || !id){
    $("#searchStatus").text("Enter both User Id and Post Id.").css("color", "#b91c1c");
    return;
  }

  $("#searchStatus").text("Searching...").css("color", "#4b5563");

  const url = buildUrlFromTemplate(RIA_TEMPLATE, userID, id);

  $.ajax({
    url,
    type: "GET",
    dataType: "json",
    success: async function(data){
      const doc = Array.isArray(data?.value) ? data.value[0] : data;

      if (!doc){
        $("#searchStatus").text("No post found.").css("color", "#b91c1c");
        return;
      }

      $("#searchStatus").text("Post found ✅ (click it to open)").css("color", "#065f46");
      $("#SearchResult").html(buildPostCard(doc));

      await hydrateSasForCards($("#SearchResult"));
    },
    error: function(xhr, status, err){
      console.error("Search failed:", status, err, xhr?.responseText);
      $("#searchStatus").text("Search failed — check console.").css("color", "#b91c1c");
    }
  });
}

function clearSearch(){
  $("#searchUserID").val("");
  $("#searchId").val("");
  $("#searchStatus").text("");
  $("#SearchResult").empty();
}

// ✅ Hydrate cards with SAS URLs (images)
async function hydrateSasForCards($root){
  if (!GETSAS_ENDPOINT || GETSAS_ENDPOINT.includes("PASTE_YOUR")) {
    console.warn("GETSAS_ENDPOINT not set.");
    // fallback public
    $root.find(".media-card").each(function(){
      const filePath = $(this).data("filepath");
      if (!filePath) return;
      const publicUrl = buildBlobUrl(filePath);
      $(this).find(".js-sas-img").attr("src", publicUrl);
    });
    return;
  }

  const cards = $root.find(".media-card").toArray();
  const uniquePaths = Array.from(new Set(cards.map(c => String($(c).data("filepath") || "").trim()).filter(Boolean)));

  const sasResults = await Promise.all(uniquePaths.map(async (p) => {
    try {
      const sas = await getSasUrl(p);
      return { filePath: p, sasUrl: sas };
    } catch (e) {
      console.error("SAS resolve failed for", p, e);
      return { filePath: p, sasUrl: null };
    }
  }));

  const map = new Map(sasResults.map(r => [r.filePath, r]));

  cards.forEach(cardEl => {
    const $card = $(cardEl);
    const filePath = String($card.data("filepath") || "").trim();
    if (!filePath) return;

    const r = map.get(filePath);
    if (!r || !r.sasUrl) {
      const errMsg = $card.find(".image-error")[0];
      if (errMsg) {
        errMsg.textContent = "Could not load image (SAS failed).";
        errMsg.style.display = "block";
      }
      // fallback public
      const publicUrl = buildBlobUrl(filePath);
      $card.find(".js-sas-img").attr("src", publicUrl);
      return;
    }

    const $img = $card.find(".js-sas-img");
    if ($img.length) {
      $img
        .attr("src", r.sasUrl)
        .off("error")
        .on("error", function(){
          imageFallbackToLink(this, r.sasUrl, $img.attr("data-label") || r.sasUrl);
        });
    }
  });
}

// === GetSas client (cached) ===
async function getSasUrl(filePath){
  const raw = String(filePath || "").trim();
  if (!raw) throw new Error("Missing filePath");

  // Normalize what we send to GetSas:
  // Cosmos stores "/media/<blobName>" but GetSas expects "<blobName>" (because container is fixed)
  let blobArg = raw
    .replace(/^https?:\/\/[^/]+/i, "")  // strip domain if absolute URL
    .replace(/^\/+/, "");               // remove leading slash

  // If it starts with "media/", strip it (container prefix)
  if (blobArg.toLowerCase().startsWith("media/")) {
    blobArg = blobArg.slice("media/".length);
  }

  if (!blobArg) throw new Error("Invalid blob path after normalization");

  // cache by ORIGINAL filePath (so cards stay consistent)
  if (sasCache.has(raw)) return sasCache.get(raw).sasUrl;

  // Call your function
  const url = appendQuery(GETSAS_ENDPOINT, "blob", blobArg);

  const result = await $.ajax({
    url,
    type: "GET",
    dataType: "json"
  });

  if (!result?.sasUrl) throw new Error("GetSas returned no sasUrl");

  sasCache.set(raw, { sasUrl: result.sasUrl, expiresOn: result.expiresOn || null });
  return result.sasUrl;
}

function appendQuery(baseUrl, name, value){
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
}


// === Helpers ===
function buildUrlFromTemplate(templateUrl, userID, id){
  return templateUrl
    .replace("%7BuserID%7D", encodeURIComponent(userID))
    .replace("%7Bid%7D", encodeURIComponent(id))
    .replace("{userID}", encodeURIComponent(userID))
    .replace("{id}", encodeURIComponent(id));
}

function unwrapMaybeBase64(value) {
  if (value && typeof value === "object" && "$content" in value) {
    try { return atob(value.$content); } catch { return value.$content || ""; }
  }
  return value || "";
}

function buildBlobUrl(filePath) {
  if (!filePath) return "";
  const trimmed = String(filePath).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const left = (BLOB_ACCOUNT || "").replace(/\/+$/g, "");
  const right = trimmed.replace(/^\/+/g, "");
  return `${left}/${right}`;
}

function isLikelyVideo({ contentType, url, fileName }) {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("video/")) return true;
  const target = ((url || "") + " " + (fileName || "")).toLowerCase();
  return /\.(mp4|m4v|webm|og[gv]|mov|avi)(\?|#|$)/.test(target);
}

function imageFallbackToLink(imgEl, url, label) {
  const card = imgEl.closest(".media-card");
  if (!card) return;
  const thumb = card.querySelector(".media-thumb");
  const errMsg = card.querySelector(".image-error");

  if (thumb) {
    thumb.innerHTML = `<a href="${url}" target="_blank" rel="noopener" class="video-link">${label || url}</a>`;
  }
  if (errMsg) {
    errMsg.textContent = "Image failed to load — opened as link instead.";
    errMsg.style.display = "block";
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
