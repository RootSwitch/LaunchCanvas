'use strict';
// Docs chrome: the pages are static HTML - the only moving part is the
// shared theme picker (built and wired in themes.js).
(function () {
    window.Themes.wirePicker(document.getElementById('theme-select'));
})();
