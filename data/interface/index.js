var background = (function () {
  var tmp = {};
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (request) {
      for (var id in tmp) {
        if (tmp[id] && (typeof tmp[id] === "function")) {
          if (request.path === "background-to-popup") {
            if (request.method === id) tmp[id](request.data);
          }
        }
      }
    });
    /*  */
    return {
      "receive": function (id, callback) {tmp[id] = callback},
      "send": function (id, data) {
        chrome.runtime.sendMessage({"path": "popup-to-background", "method": id, "data": data});
      }
    }
  } else {
    return {
      "send": function () {},
      "receive": function () {}
    }
  }
})();

var config = {
  "prevent": {
    "drop": function (e) {
      if (e.target.id.indexOf("fileio") !== -1) return;
      e.preventDefault();
    }
  },
  "resize": {
    "timeout": null,
    "method": function () {
      if (config.port.name === "win") {
        if (config.resize.timeout) window.clearTimeout(config.resize.timeout);
        config.resize.timeout = window.setTimeout(async function () {
          var current = await chrome.windows.getCurrent();
          /*  */
          config.storage.write("interface.size", {
            "top": current.top,
            "left": current.left,
            "width": current.width,
            "height": current.height
          });
        }, 1000);
      }
    }
  },
  "port": {
    "name": '',
    "connect": function () {
      config.port.name = "webapp";
      var context = document.documentElement.getAttribute("context");
      /*  */
      if (chrome.runtime) {
        if (chrome.runtime.connect) {
          if (context !== config.port.name) {
            if (document.location.search === "?tab") config.port.name = "tab";
            if (document.location.search === "?win") config.port.name = "win";
            /*  */
            chrome.runtime.connect({
              "name": config.port.name
            });
          }
        }
      }
      /*  */
      document.documentElement.setAttribute("context", config.port.name);
    }
  },
  "storage": {
    "local": {},
    "read": function (id) {
      return config.storage.local[id];
    },
    "load": function (callback) {
      chrome.storage.local.get(null, function (e) {
        config.storage.local = e;
        callback();
      });
    },
    "write": function (id, data) {
      if (id) {
        if (data !== '' && data !== null && data !== undefined) {
          var tmp = {};
          tmp[id] = data;
          config.storage.local[id] = data;
          chrome.storage.local.set(tmp, function () {});
        } else {
          delete config.storage.local[id];
          chrome.storage.local.remove(id, function () {});
        }
      }
    }
  },
  "fileio": {
    "api": undefined,
    "picker": undefined,
    "permission": undefined,
    "read": {
      "zip": function (target) {
        var filelist = document.getElementById("filelist");
        /*  */
        config.zip.files = [];
        config.zip.blob = null;
        config.zip.path = null;
    		filelist.textContent = '';
        config.zip.filename = null;
        delete config.fileio.picker;
        /*  */
    		config.zip.model.getEntries(target, function (entries) {
    			entries.forEach(function (file) {
            if (file.directory) {
              var li = document.createElement("li");
              li.textContent = "> " + file.filename;
              li.setAttribute("class", "folder");
              if (file.offset === 0) li.setAttribute("root", '');
              filelist.appendChild(li);
            } else {
              var li = document.createElement("li");
              li.setAttribute("path", file.filename);
              li.setAttribute("class", "file");
      				li.textContent = file.filename;
              config.zip.files.push(file);
      				filelist.appendChild(li);
              /*  */
      				li.addEventListener("click", function (e) {
                if (e.detail === 2) {
                  config.zip.download(file, li);
                }
              }, false);
            }
    			});
    		});
      }
    }
  },
  "download": {
    "initiate": async function (callback) {
      config.fileio.api = window.showDirectoryPicker ? "supported" : "unsupported";
      if (config.fileio.api === "supported") {
        try {
          if (!config.fileio.picker) config.fileio.picker = await window.showDirectoryPicker();
          config.fileio.permission = await config.fileio.picker.requestPermission({"mode": "readwrite"});
        } catch (e) {}
      }
      /*  */
      if (callback) callback();
    },
    "start": async function (blob, path, filename, callback) {
      if (config.fileio.api === "supported") {
        if (config.fileio.permission === "granted") {
          try {
            const root = config.fileio.picker;
            const arr = path.split('/');
            const name = arr.pop();
            let subdir = null;
            /*  */
            for (var i = 0; i < arr.length; i++) {
              var target = subdir ? subdir : root;
              subdir = await target.getDirectoryHandle(arr[i], {"create": true});
            }
            /*  */
            var target = subdir ? subdir : root;
            var file = await target.getFileHandle(name, {"create": true});
            var writable = await file.createWritable();
            /*  */
            await writable.write(blob);
            writable.close();
          } catch (e) {
            config.zip.onerror("Error >> FileSystem API");
          }
        }
      } else {
        var url = URL.createObjectURL(blob);
        /*  */
        if (chrome && chrome.permissions) {
          var granted = await chrome.permissions.request({"permissions": ["downloads"]});
          if (granted) {
            await chrome.downloads.download({"url": url, "filename": path});
          }
        } else {
          var a = document.createElement('a');
          a.setAttribute("download", path);
          a.setAttribute("href", url);
          a.click();
          /*  */
          URL.revokeObjectURL(url);
        }
      }
      /*  */
      var filelist = document.getElementById("filelist");
      var li = filelist.querySelector("li[class='file'][path='" + filename + "']");
      var progress = li ? li.querySelector("progress") : null;
      if (progress) progress.remove();
      if (callback) callback();
    }
  },
	"zip": {
		"files": [],
    "blob": null,
    "path": null,
    "filename": null,
		"onerror": function (e) {alert(e)},
    "onprogress": function (current, total, target) {
      if (target) {
        var progress = document.createElement("progress");
        /*  */
        progress.max = total;
        progress.value = current;
        target.appendChild(progress);
        target.scrollIntoView({"behavior": "auto", "block": "center", "inline": "center"});
      }
    },
		"download": function (file, li) {
			config.zip.model.getEntryFile(file, li, function (blob) {
        config.zip.blob = blob;
        config.zip.path = file.filename;
        config.zip.filename = file.filename;
        /*  */
        config.download.initiate(function () {
          config.download.start(config.zip.blob, config.zip.path, config.zip.filename);
        });
			});
		},
		"model": {
			"getEntries": async function (file, onzipend) {
        zip.configure({"useWebWorkers": true});
        /*  */
        var reader = new zip.ZipReader(new zip.BlobReader(file));
        if (reader) {
          var entries = await reader.getEntries();
          if (entries && entries.length) {
            onzipend(entries);
          } else {
            config.zip.onerror("Error >> getEntries");
          }
        } else {
          config.zip.onerror("Error >> ZipReader");
        }
      },
			"getEntryFile": async function (entry, target, onzipend) {
        zip.configure({"useWebWorkers": true});
        /*  */
        var buffer = await entry.getData(new zip.BlobWriter(), { 
          "onprogress": function (current, total) {
            config.zip.onprogress(current, total, target);
          }
        });
        /*  */
        if (buffer) {
          var type = zip.getMimeType(entry.filename);
          if (type) {
            var blob = new Blob([buffer], {"type": type});
            if (blob) onzipend(blob);
          } else {
            config.zip.onerror("Error >> getMimeType");
          }
        } else {
          config.zip.onerror("Error >> getData");
        }
			}
		}
	},
  "load": function () {
    var fileio = document.getElementById("fileio");
    var reload = document.getElementById("reload");
    var support = document.getElementById("support");
    var donation = document.getElementById("donation");
    var download = document.getElementById("download");
    var filename = document.getElementById("filename");
    /*  */
    reload.addEventListener("click", function () {
      document.location.reload();
    });
    /*  */
    support.addEventListener("click", function () {
      if (config.port.name !== "webapp") {
        var url = config.addon.homepage();
        chrome.tabs.create({"url": url, "active": true});
      }
    }, false);
    /*  */
    donation.addEventListener("click", function () {
      if (config.port.name !== "webapp") {
        var url = config.addon.homepage() + "?reason=support";
        chrome.tabs.create({"url": url, "active": true});
      }
    }, false);
    /*  */
    fileio.addEventListener("change", function (e) {
      if (e.target) {
        if (e.target.files) {
          if (e.target.files.length) {
            var file = e.target.files[0];
            config.fileio.read.zip(file);
          }
        }
      }
    }, false);
    /*  */
    download.addEventListener("click", async function (e) {
      if (config.zip.files) {
        if (config.zip.files.length) {
          const files = [...config.zip.files];
          /*  */
          config.download.initiate(function () {
            var loop = function (file) {
              var filelist = document.getElementById("filelist");
              var path = (filename.value ? filename.value + '/' : '') + file.filename;
              var li = filelist.querySelector("li[class='file'][path='" + file.filename + "']");
              /*  */
              config.zip.model.getEntryFile(file, li, function (blob) {
                config.zip.blob = blob;
                config.zip.path = path;
                config.zip.filename = file.filename;
                /*  */
                download.setAttribute("processing", '');
                download.value = "Processing, please wait...";
                /*  */
                config.download.start(config.zip.blob, config.zip.path, config.zip.filename, function () {
                  if (files.length) {
                    loop(files.shift());
                  } else {
                    window.setTimeout(function () {
                      download.value = "Unzip & Download";
                      download.removeAttribute("processing");
                      filelist.scrollTo({"top": 0, "behavior": "smooth"});
                    }, 300);
                  }
                });
              });
            };
            /*  */
            if (files.length) {
              loop(files.shift());
            }
          });
        }
      }
    });
    /*  */
    window.removeEventListener("load", config.load, false);
  }
};

config.port.connect();

window.addEventListener("load", config.load, false);
document.addEventListener("drop", config.prevent.drop, true);
window.addEventListener("resize", config.resize.method, false);
document.addEventListener("dragover", config.prevent.drop, true);