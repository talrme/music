(function () {
  "use strict";

  var STORAGE_THEME = "music-theme";
  var STORAGE_ACCENT = "music-accent";

  var catalog = null;
  var songMap = new Map();
  var state = {
    queue: [],
    currentIndex: 0,
  };

  var seeking = false;
  var lyricsCache = new Map();
  var lastFocused = null;
  /** @type {string|null} which playlist accordion is expanded (one at a time) */
  var expandedPlaylistId = null;

  /** @type {{ fromIndex: number, toIndex?: number } | null} mobile queue drag */
  var queueTouchDrag = null;

  /**
   * Playlist key (same as accordion plKey) when the queue was started by clicking a song
   * in that playlist. Cleared for URL/default load and when using Add to queue.
   * @type {string|null}
   */
  var queuePlaylistContext = null;

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function parseUrl() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get("q");
    var i = params.get("i");
    var ids = [];
    if (q) {
      ids = q
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
    }
    var index = 0;
    if (i !== null && i !== "") {
      var n = parseInt(i, 10);
      if (!isNaN(n) && n >= 0) index = n;
    }
    return { ids: ids, index: index };
  }

  function validateQueueIds(ids) {
    return ids.filter(function (id) {
      return songMap.has(id);
    });
  }

  function defaultQueueFromCatalog() {
    if (!catalog || !catalog.playlists || !catalog.playlists.length) return [];
    var first = catalog.playlists[0];
    if (!first.songIds || !first.songIds.length) return [];
    return validateQueueIds(first.songIds.slice());
  }

  function applyInitialState() {
    var parsed = parseUrl();
    var ids = validateQueueIds(parsed.ids);
    if (!ids.length) ids = defaultQueueFromCatalog();
    var idx = parsed.index;
    if (idx >= ids.length) idx = Math.max(0, ids.length - 1);
    state.queue = ids;
    state.currentIndex = ids.length ? Math.min(idx, ids.length - 1) : 0;
    queuePlaylistContext = null;
  }

  function syncUrl() {
    var params = new URLSearchParams();
    if (state.queue.length) {
      params.set("q", state.queue.join(","));
      params.set("i", String(state.currentIndex));
    }
    var qs = params.toString();
    var path = window.location.pathname + (qs ? "?" + qs : "");
    window.history.replaceState(null, "", path);
  }

  function createEqIndicator(extraClass) {
    var span = document.createElement("span");
    span.className = "eq-indicator " + extraClass;
    span.setAttribute("aria-hidden", "true");
    for (var bi = 0; bi < 4; bi++) {
      var bar = document.createElement("span");
      bar.className = "eq-indicator__bar";
      span.appendChild(bar);
    }
    return span;
  }

  function reorderQueue(from, to) {
    if (from === to || isNaN(from) || isNaN(to)) return;
    if (from < 0 || to < 0 || from >= state.queue.length || to >= state.queue.length) return;
    var currentId = state.queue[state.currentIndex];
    var item = state.queue.splice(from, 1)[0];
    state.queue.splice(to, 0, item);
    state.currentIndex = Math.max(0, state.queue.indexOf(currentId));
    syncUrl();
    renderQueue();
    loadTrack();
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function loadTrack() {
    var id = state.queue[state.currentIndex];
    var song = id ? songMap.get(id) : null;
    var audio = els.audio;
    var cover = els.coverArt;
    var vinyl = els.vinyl;

    if (!song) {
      audio.removeAttribute("src");
      audio.load();
      $("track-title").textContent = "—";
      $("track-artist").textContent = "";
      cover.removeAttribute("src");
      cover.alt = "";
      vinyl.classList.remove("vinyl--playing");
      setLyricsAvailability(null);
      var heroEq = $("hero-eq");
      if (heroEq) heroEq.hidden = true;
      document.body.classList.remove("is-audio-playing");
      return;
    }

    var heroEqEl = $("hero-eq");
    if (heroEqEl) heroEqEl.hidden = false;

    $("track-title").textContent = song.title || "Untitled";
    $("track-artist").textContent = song.artist || "";
    cover.alt = song.title ? "Cover: " + song.title : "";
    cover.onerror = function () {
      cover.onerror = null;
      cover.removeAttribute("src");
    };
    if (song.cover) {
      cover.src = song.cover;
    } else {
      cover.removeAttribute("src");
    }

    audio.src = song.audio;
    audio.load();
    setLyricsAvailability(song);
    loadLyricsContent(song);

    if (!audio.paused) {
      audio.play().catch(function () {});
    }
  }

  function setLyricsAvailability(song) {
    var btn = els.btnLyrics;
    if (!song) {
      btn.hidden = true;
      els.lyricsPanel.hidden = true;
      return;
    }
    var inline = song.lyrics && String(song.lyrics).trim();
    var file = song.lyricsFile && String(song.lyricsFile).trim();
    var has = !!(inline || file);
    btn.hidden = !has;
    if (!has) {
      els.lyricsPanel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
  }

  function loadLyricsContent(song) {
    els.lyricsText.textContent = "";
    if (!song) return;
    if (song.lyrics && String(song.lyrics).trim()) {
      els.lyricsText.textContent = song.lyrics.trim();
      return;
    }
    if (!song.lyricsFile) return;
    var path = song.lyricsFile;
    if (lyricsCache.has(path)) {
      els.lyricsText.textContent = lyricsCache.get(path);
      return;
    }
    fetch(path)
      .then(function (r) {
        if (!r.ok) throw new Error("lyrics fetch");
        return r.text();
      })
      .then(function (text) {
        lyricsCache.set(path, text);
        if (state.queue[state.currentIndex] === song.id) {
          els.lyricsText.textContent = text;
        }
      })
      .catch(function () {
        els.lyricsText.textContent = "(Could not load lyrics file.)";
      });
  }

  function updatePlayButton() {
    if (!els.audio || !els.btnPlay) return;
    var paused = els.audio.paused;
    els.btnPlay.classList.toggle("is-playing", !paused);
    els.btnPlay.setAttribute("aria-label", paused ? "Play" : "Pause");
    document.body.classList.toggle("is-audio-playing", !paused);
    if (els.vinyl) {
      if (paused) {
        els.vinyl.classList.remove("vinyl--playing");
      } else {
        els.vinyl.classList.add("vinyl--playing");
      }
    }
  }

  function updateProgress() {
    if (seeking) return;
    var audio = els.audio;
    var dur = audio.duration;
    var cur = audio.currentTime;
    $("time-duration").textContent = formatTime(dur);
    $("time-current").textContent = formatTime(cur);
    var seek = $("seek");
    if (isFinite(dur) && dur > 0) {
      seek.max = 100;
      seek.value = (cur / dur) * 100;
    } else {
      seek.value = 0;
    }
  }

  function renderPlaylists() {
    var ul = $("playlist-list");
    ul.innerHTML = "";
    if (!catalog || !catalog.playlists) return;
    catalog.playlists.forEach(function (pl, plIndex) {
      var plKey = pl.id != null ? String(pl.id) : String(plIndex);
      var isOpen = expandedPlaylistId === plKey;
      var li = document.createElement("li");
      li.className = "playlist-accordion";

      var header = document.createElement("div");
      header.className = "playlist-accordion__header";

      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "playlist-accordion__toggle";
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      var panelId = "playlist-panel-" + plIndex;
      toggle.setAttribute("aria-controls", panelId);

      var nameSpan = document.createElement("span");
      nameSpan.className = "playlist-accordion__name";
      nameSpan.textContent = pl.name || plKey;

      var countSpan = document.createElement("span");
      countSpan.className = "playlist-accordion__count";
      var trackCount = (pl.songIds || []).filter(function (sid) {
        return songMap.has(sid);
      }).length;
      countSpan.textContent = trackCount === 1 ? "1 song" : trackCount + " songs";

      var info = document.createElement("span");
      info.className = "playlist-accordion__info";
      info.appendChild(nameSpan);
      info.appendChild(countSpan);

      var iconWrap = document.createElement("span");
      iconWrap.className = "playlist-accordion__icon";
      iconWrap.setAttribute("aria-hidden", "true");
      iconWrap.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

      var chev = document.createElement("span");
      chev.className = "playlist-accordion__chevron";
      chev.setAttribute("aria-hidden", "true");

      toggle.appendChild(iconWrap);
      toggle.appendChild(info);
      toggle.appendChild(chev);
      toggle.addEventListener("click", function () {
        expandedPlaylistId = isOpen ? null : plKey;
        renderPlaylists();
      });

      header.appendChild(toggle);

      var panel = document.createElement("div");
      panel.id = panelId;
      panel.className = "playlist-accordion__panel";
      panel.hidden = !isOpen;
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-label", (pl.name || "Playlist") + " tracks");

      var songList = document.createElement("ul");
      songList.className = "playlist-accordion__songs";

      var currentId =
        state.queue.length && state.currentIndex >= 0
          ? state.queue[state.currentIndex]
          : null;

      var songOrdinal = 0;
      (pl.songIds || []).forEach(function (songId) {
        var song = songMap.get(songId);
        if (!song) return;
        songOrdinal += 1;
        var sli = document.createElement("li");
        sli.className = "playlist-accordion__song-row";

        var showPlaylistNowPlaying =
          !!currentId &&
          songId === currentId &&
          queuePlaylistContext !== null &&
          queuePlaylistContext === plKey;

        if (showPlaylistNowPlaying) {
          sli.classList.add("playlist-accordion__song-row--current");
        }

        var sbtn = document.createElement("button");
        sbtn.type = "button";
        sbtn.className = "playlist-song-btn";
        if (showPlaylistNowPlaying) {
          sbtn.classList.add("playlist-song-btn--current");
        }
        var num = document.createElement("span");
        num.className = "playlist-song-btn__num";
        num.textContent = String(songOrdinal);
        var textWrap = document.createElement("span");
        textWrap.className = "playlist-song-btn__text";
        var title = document.createElement("span");
        title.className = "playlist-song-btn__title";
        title.textContent = song.title || songId;
        textWrap.appendChild(title);
        if (song.artist) {
          var art = document.createElement("span");
          art.className = "playlist-song-btn__artist";
          art.textContent = song.artist;
          textWrap.appendChild(art);
        }
        sbtn.appendChild(num);
        if (showPlaylistNowPlaying) {
          sbtn.appendChild(createEqIndicator("eq-indicator--playlist"));
        }
        sbtn.appendChild(textWrap);
        sbtn.addEventListener("click", function () {
          closeAllSongOptionMenus();
          var ids = validateQueueIds((pl.songIds || []).slice());
          var start = ids.indexOf(songId);
          if (start === -1) return;
          queuePlaylistContext = plKey;
          state.queue = ids.slice(start);
          state.currentIndex = 0;
          syncUrl();
          renderQueue();
          loadTrack();
          var a = $("audio");
          if (a) a.play().catch(function () {});
        });

        var optWrap = document.createElement("div");
        optWrap.className = "song-options";
        var optTrigger = document.createElement("button");
        optTrigger.type = "button";
        optTrigger.className = "song-options__trigger";
        optTrigger.setAttribute("aria-label", "Song options");
        optTrigger.setAttribute("aria-expanded", "false");
        optTrigger.setAttribute("aria-haspopup", "true");
        optTrigger.innerHTML =
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="6" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="18" r="1.75"/></svg>';

        var optMenu = document.createElement("div");
        optMenu.className = "song-options__menu";
        optMenu.setAttribute("role", "menu");
        optMenu.hidden = true;

        var optAdd = document.createElement("button");
        optAdd.type = "button";
        optAdd.className = "song-options__item";
        optAdd.setAttribute("role", "menuitem");
        optAdd.textContent = "Add to queue";
        optAdd.addEventListener("click", function (e) {
          e.stopPropagation();
          optMenu.hidden = true;
          optTrigger.setAttribute("aria-expanded", "false");
          queuePlaylistContext = null;
          state.queue.push(songId);
          syncUrl();
          renderQueue();
        });

        optMenu.appendChild(optAdd);

        optTrigger.addEventListener("click", function (e) {
          e.stopPropagation();
          var opening = optMenu.hidden;
          songList.querySelectorAll(".song-options__menu").forEach(function (m) {
            m.hidden = true;
          });
          songList.querySelectorAll(".song-options__trigger").forEach(function (t) {
            t.setAttribute("aria-expanded", "false");
          });
          if (opening) {
            optMenu.hidden = false;
            optTrigger.setAttribute("aria-expanded", "true");
          }
        });

        optWrap.appendChild(optTrigger);
        optWrap.appendChild(optMenu);

        sli.appendChild(sbtn);
        sli.appendChild(optWrap);
        songList.appendChild(sli);
      });

      panel.appendChild(songList);
      li.appendChild(header);
      li.appendChild(panel);
      ul.appendChild(li);
    });
  }

  function closeAllSongOptionMenus() {
    document.querySelectorAll(".song-options__menu").forEach(function (m) {
      m.hidden = true;
    });
    document.querySelectorAll(".song-options__trigger").forEach(function (t) {
      t.setAttribute("aria-expanded", "false");
    });
  }

  function renderQueue() {
    var ol = $("queue-list");
    ol.innerHTML = "";
    state.queue.forEach(function (id, idx) {
      var song = songMap.get(id);
      var li = document.createElement("li");
      li.className = "queue-row";
      if (idx === state.currentIndex) li.classList.add("queue-row--current");
      li.dataset.index = String(idx);

      var dragHandle = document.createElement("div");
      dragHandle.className = "queue-row__drag-handle";
      dragHandle.setAttribute("draggable", "true");
      dragHandle.setAttribute("aria-label", "Drag to reorder");

      var dragSvg =
        '<svg class="queue-row__drag-icon" draggable="false" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="6" cy="5" r="1.5"/><circle cx="14" cy="5" r="1.5"/><circle cx="6" cy="10" r="1.5"/><circle cx="14" cy="10" r="1.5"/><circle cx="6" cy="15" r="1.5"/><circle cx="14" cy="15" r="1.5"/></svg>';
      dragHandle.innerHTML = dragSvg;

      var mouseDragGhost = null;
      dragHandle.addEventListener("dragstart", function (e) {
        e.stopPropagation();
        try {
          e.dataTransfer.setData("text/plain", String(idx));
          e.dataTransfer.effectAllowed = "move";
        } catch (err) {}
        var rect = li.getBoundingClientRect();
        var ox = e.clientX - rect.left;
        var oy = e.clientY - rect.top;
        mouseDragGhost = li.cloneNode(true);
        mouseDragGhost.classList.add("queue-row--drag-ghost");
        mouseDragGhost.style.width = rect.width + "px";
        mouseDragGhost.style.boxSizing = "border-box";
        mouseDragGhost.style.position = "fixed";
        mouseDragGhost.style.left = "-9999px";
        mouseDragGhost.style.top = "0";
        mouseDragGhost.style.margin = "0";
        mouseDragGhost.style.pointerEvents = "none";
        mouseDragGhost.style.listStyle = "none";
        document.body.appendChild(mouseDragGhost);
        try {
          e.dataTransfer.setDragImage(mouseDragGhost, ox, oy);
        } catch (err2) {}
        li.classList.add("queue-row--dragging-source");
      });
      dragHandle.addEventListener("dragend", function () {
        if (mouseDragGhost && mouseDragGhost.parentNode) {
          mouseDragGhost.parentNode.removeChild(mouseDragGhost);
        }
        mouseDragGhost = null;
        li.classList.remove("queue-row--dragging-source");
      });

      function queueTouchMove(e) {
        if (!queueTouchDrag || e.touches.length !== 1) return;
        e.preventDefault();
        var x = e.touches[0].clientX;
        var y = e.touches[0].clientY;
        if (queueTouchDrag.ghost) {
          queueTouchDrag.ghost.style.left = x - queueTouchDrag.grabX + "px";
          queueTouchDrag.ghost.style.top = y - queueTouchDrag.grabY + "px";
        }
        var el = document.elementFromPoint(x, y);
        var row = el && el.closest ? el.closest(".queue-row") : null;
        if (row && ol.contains(row) && row.dataset.index != null) {
          queueTouchDrag.toIndex = parseInt(row.dataset.index, 10);
        } else {
          var rows = ol.querySelectorAll(".queue-row");
          for (var ri = 0; ri < rows.length; ri++) {
            var r = rows[ri].getBoundingClientRect();
            if (y >= r.top && y <= r.bottom) {
              queueTouchDrag.toIndex = parseInt(rows[ri].dataset.index, 10);
              break;
            }
          }
        }
      }

      function queueTouchEnd() {
        document.removeEventListener("touchmove", queueTouchMove);
        document.removeEventListener("touchend", queueTouchEnd);
        document.removeEventListener("touchcancel", queueTouchEnd);
        if (queueTouchDrag) {
          var from = queueTouchDrag.fromIndex;
          var to = queueTouchDrag.toIndex;
          var ghost = queueTouchDrag.ghost;
          queueTouchDrag = null;
          if (ghost && ghost.parentNode) {
            ghost.parentNode.removeChild(ghost);
          }
          li.classList.remove("queue-row--dragging-source");
          if (to != null && !isNaN(to) && from !== to) {
            reorderQueue(from, to);
          }
        }
      }

      dragHandle.addEventListener(
        "touchstart",
        function (e) {
          if (e.touches.length !== 1) return;
          var rect = li.getBoundingClientRect();
          var tx = e.touches[0].clientX;
          var ty = e.touches[0].clientY;
          var tGhost = li.cloneNode(true);
          tGhost.classList.add("queue-row--touch-ghost");
          tGhost.style.width = rect.width + "px";
          tGhost.style.boxSizing = "border-box";
          tGhost.style.position = "fixed";
          tGhost.style.left = rect.left + "px";
          tGhost.style.top = rect.top + "px";
          tGhost.style.margin = "0";
          tGhost.style.pointerEvents = "none";
          tGhost.style.listStyle = "none";
          tGhost.style.zIndex = "10050";
          document.body.appendChild(tGhost);
          queueTouchDrag = {
            fromIndex: idx,
            toIndex: idx,
            ghost: tGhost,
            grabX: tx - rect.left,
            grabY: ty - rect.top,
          };
          li.classList.add("queue-row--dragging-source");
          document.addEventListener("touchmove", queueTouchMove, { passive: false });
          document.addEventListener("touchend", queueTouchEnd, { passive: true });
          document.addEventListener("touchcancel", queueTouchEnd, { passive: true });
        },
        { passive: true }
      );

      li.addEventListener("dragenter", function (e) {
        e.preventDefault();
      });
      li.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      li.addEventListener("drop", function (e) {
        e.preventDefault();
        var from = parseInt(e.dataTransfer.getData("text/plain"), 10);
        var to = idx;
        reorderQueue(from, to);
      });

      var indexSpan = document.createElement("span");
      indexSpan.className = "queue-row__index";
      indexSpan.textContent = String(idx + 1);

      var eqIndicator = null;
      if (idx === state.currentIndex) {
        eqIndicator = createEqIndicator("eq-indicator--queue");
      }

      var meta = document.createElement("div");
      meta.className = "library-row__meta";
      var t = document.createElement("div");
      t.className = "library-row__title";
      t.textContent = song ? song.title || song.id : id;
      var ar = document.createElement("div");
      ar.className = "library-row__artist";
      ar.textContent = song && song.artist ? song.artist : "";
      meta.appendChild(t);
      meta.appendChild(ar);

      var controls = document.createElement("div");
      controls.className = "queue-row__controls";

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "queue-row__btn";
      remove.setAttribute("aria-label", "Remove from queue");
      remove.textContent = "×";
      remove.addEventListener("click", function () {
        var wasCurrent = idx === state.currentIndex;
        state.queue.splice(idx, 1);
        if (!state.queue.length) {
          state.currentIndex = 0;
        } else if (wasCurrent) {
          state.currentIndex = Math.min(idx, state.queue.length - 1);
        } else if (idx < state.currentIndex) {
          state.currentIndex--;
        }
        syncUrl();
        renderQueue();
        loadTrack();
      });

      controls.appendChild(remove);

      li.appendChild(dragHandle);
      li.appendChild(indexSpan);
      if (eqIndicator) li.appendChild(eqIndicator);
      li.appendChild(meta);
      li.appendChild(controls);
      ol.appendChild(li);
    });
    if (!state.queue.length) {
      queuePlaylistContext = null;
    }
    renderPlaylists();
  }

  function openSettings() {
    lastFocused = document.activeElement;
    els.settingsBackdrop.hidden = false;
    els.settingsDialog.hidden = false;
    setTimeout(function () {
      els.settingsClose.focus();
    }, 0);
  }

  function closeSettings() {
    els.settingsBackdrop.hidden = true;
    els.settingsDialog.hidden = true;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_THEME, theme);
    updateThemeChips();
    var meta = $("meta-theme-color");
    if (theme === "light") {
      meta.setAttribute("content", "#f4f4f8");
    } else {
      meta.setAttribute("content", "#1a1a24");
    }
  }

  function applyAccent(hex) {
    if (!hex || hex[0] !== "#") return;
    document.documentElement.style.setProperty("--accent", hex);
    localStorage.setItem(STORAGE_ACCENT, hex);
    $("accent-picker").value = hex;
  }

  function updateThemeChips() {
    var current = document.documentElement.getAttribute("data-theme") || "dark";
    var chips = document.querySelectorAll(".theme-chip");
    chips.forEach(function (cb) {
      cb.setAttribute("aria-pressed", cb.dataset.theme === current ? "true" : "false");
    });
  }

  function initThemeFromStorage() {
    var t = localStorage.getItem(STORAGE_THEME);
    if (t === "light" || t === "dark") {
      applyTheme(t);
    } else {
      applyTheme("dark");
    }
    var acc = localStorage.getItem(STORAGE_ACCENT);
    if (acc && /^#[0-9a-fA-F]{6}$/.test(acc)) {
      applyAccent(acc);
    }
  }

  function renderThemePresets() {
    var wrap = $("theme-presets");
    wrap.innerHTML = "";
    [
      { id: "dark", label: "Dark" },
      { id: "light", label: "Light" },
    ].forEach(function (opt) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "theme-chip";
      b.dataset.theme = opt.id;
      b.textContent = opt.label;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        applyTheme(opt.id);
      });
      wrap.appendChild(b);
    });
    updateThemeChips();
  }

  function init() {
    els.audio = $("audio");
    els.coverArt = $("cover-art");
    els.vinyl = $("vinyl");
    els.btnPlay = $("btn-play");
    els.btnLyrics = $("btn-lyrics");
    els.lyricsPanel = $("lyrics-panel");
    els.lyricsText = $("lyrics-text");
    els.settingsBackdrop = $("settings-backdrop");
    els.settingsDialog = $("settings-dialog");
    els.settingsClose = $("settings-close");

    fetch("catalog.json")
      .then(function (r) {
        if (!r.ok) throw new Error("catalog");
        return r.json();
      })
      .then(function (data) {
        catalog = data;
        catalog.songs.forEach(function (s) {
          songMap.set(s.id, s);
        });
        applyInitialState();
        renderQueue();
        loadTrack();
        syncUrl();
      })
      .catch(function () {
        $("track-title").textContent = "Could not load catalog";
      });

    initThemeFromStorage();
    renderThemePresets();

    document.body.addEventListener("click", function (e) {
      if (e.target.closest(".song-options")) return;
      closeAllSongOptionMenus();
    });

    $("accent-picker").addEventListener("input", function () {
      applyAccent(this.value);
    });

    els.btnPlay.addEventListener("click", function () {
      if (!state.queue.length) return;
      if (els.audio.paused) {
        els.audio.play().catch(function () {});
      } else {
        els.audio.pause();
      }
    });

    $("btn-prev").addEventListener("click", function () {
      if (!state.queue.length) return;
      state.currentIndex =
        (state.currentIndex - 1 + state.queue.length) % state.queue.length;
      syncUrl();
      renderQueue();
      loadTrack();
      els.audio.play().catch(function () {});
    });

    $("btn-next").addEventListener("click", function () {
      if (!state.queue.length) return;
      state.currentIndex = (state.currentIndex + 1) % state.queue.length;
      syncUrl();
      renderQueue();
      loadTrack();
      els.audio.play().catch(function () {});
    });

    els.audio.addEventListener("play", updatePlayButton);
    els.audio.addEventListener("playing", updatePlayButton);
    els.audio.addEventListener("pause", updatePlayButton);
    els.audio.addEventListener("timeupdate", function () {
      updateProgress();
      if (!els.btnPlay || !els.audio) return;
      var playing = !els.audio.paused;
      if (els.btnPlay.classList.contains("is-playing") !== playing) {
        updatePlayButton();
      }
    });
    els.audio.addEventListener("loadedmetadata", updateProgress);
    els.audio.addEventListener("ended", function () {
      if (!state.queue.length) return;
      state.currentIndex = (state.currentIndex + 1) % state.queue.length;
      syncUrl();
      renderQueue();
      loadTrack();
      els.audio.play().catch(function () {});
    });

    $("seek").addEventListener("input", function () {
      seeking = true;
      var dur = els.audio.duration;
      if (isFinite(dur) && dur > 0) {
        els.audio.currentTime = (parseFloat(this.value) / 100) * dur;
      }
    });
    $("seek").addEventListener("change", function () {
      seeking = false;
    });

    $("volume").addEventListener("input", function () {
      els.audio.volume = parseFloat(this.value);
    });

    els.btnLyrics.addEventListener("click", function () {
      var open = els.lyricsPanel.hidden;
      els.lyricsPanel.hidden = !open;
      els.btnLyrics.setAttribute("aria-expanded", open ? "true" : "false");
    });

    $("btn-settings").addEventListener("click", openSettings);
    els.settingsClose.addEventListener("click", closeSettings);
    els.settingsBackdrop.addEventListener("click", closeSettings);
    els.settingsDialog.addEventListener("keydown", function (e) {
      if (els.settingsDialog.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeSettings();
        return;
      }
      if (e.key !== "Tab") return;
      var root = els.settingsDialog.querySelector(".modal__content");
      if (!root) return;
      var focusables = root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      var list = Array.prototype.filter.call(focusables, function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
      if (list.length === 0) return;
      var first = list[0];
      var last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    $("btn-copy-url").addEventListener("click", function () {
      syncUrl();
      var url = window.location.href;
      $("url-hint").textContent = "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () {
            $("url-hint").textContent = "Link copied to clipboard.";
          },
          function () {
            $("url-hint").textContent = url;
          }
        );
      } else {
        $("url-hint").textContent = url;
      }
    });

    updatePlayButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
