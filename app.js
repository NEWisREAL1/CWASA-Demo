(function () {
    var sigmlInput = document.getElementById("sigmlInput");
    var playBtn = document.getElementById("playBtn");
    var stopBtn = document.getElementById("stopBtn");
    var statusLog = document.getElementById("statusLog");
    var exampleSelect = document.getElementById("exampleSelect");

    function log(msg) {
        var line = document.createElement("div");
        var time = new Date().toLocaleTimeString();
        line.textContent = "[" + time + "] " + msg;
        statusLog.appendChild(line);
        statusLog.scrollTop = statusLog.scrollHeight;
    }

    function loadExample(url) {
        if (!url) {
            return;
        }
        log("Loading example: " + url);
        fetch(url)
            .then(function (res) {
                if (!res.ok) {
                    throw new Error("HTTP " + res.status);
                }
                return res.text();
            })
            .then(function (text) {
                sigmlInput.value = text;
                log("Loaded " + url);
            })
            .catch(function (err) {
                log("Failed to load " + url + ": " + err.message);
            });
    }

    exampleSelect.addEventListener("change", function () {
        loadExample(exampleSelect.value);
    });

    playBtn.addEventListener("click", function () {
        var sigml = sigmlInput.value.trim();
        if (!sigml) {
            log("Cannot animate: SiGML text is empty.");
            return;
        }
        log("Playing SiGML...");
        CWASA.playSiGMLText(sigml, 0);
    });

    stopBtn.addEventListener("click", function () {
        CWASA.stopSiGML(0);
        log("Stopped.");
    });

    window.addEventListener("load", function () {
        log("Initialising CWASA...");
        // Pass an (empty) config object rather than nothing: CWASA treats a
        // missing argument as "load cwaclientcfg.json from this page's own
        // directory", which we don't have, causing a needless 404.
        CWASA.init({});
        CWASA.ready.then(function () {
            log("Avatar ready.");
            playBtn.disabled = false;
        });

        CWASA.addHook("status", function (evt) {
            log(evt.msg);
        }, 0);

        CWASA.addHook("animactive", function () {
            playBtn.disabled = true;
            stopBtn.disabled = false;
        }, 0);

        CWASA.addHook("animidle", function () {
            playBtn.disabled = false;
            stopBtn.disabled = true;
        }, 0);

        // Pre-load the default example so there's something to Animate right away.
        exampleSelect.value = "examples/iTakeMug.sigml";
        loadExample(exampleSelect.value);
    });
})();
