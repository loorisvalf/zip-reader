var background = {
  "port": null,
  "message": {},
  "receive": function (id, callback) {
    if (id) {
      background.message[id] = callback;
    }
  },
  "connect": function (port) {
    chrome.runtime.onMessage.addListener(background.listener); 
    /*  */
    if (port) {
      background.port = port;
      background.port.onMessage.addListener(background.listener);
      background.port.onDisconnect.addListener(function () {
        background.port = null;
      });
    }
  },
  "post": function (id, data) {
    if (id) {
      if (background.port) {
        background.port.postMessage({
          "method": id,
          "data": data,
          "port": background.port.name,
          "path": "popup-to-background"
        });
      }
    }
  },
  "send": function (id, data) {
    if (id) {
      if (background.port) {
        if (background.port.name !== "webapp") {
          chrome.runtime.sendMessage({
            "method": id,
            "data": data,
            "path": "popup-to-background"
          }, function () {
            return chrome.runtime.lastError;
          });
        }
      }
    }
  },
  "listener": function (e) {
    if (e) {
      for (let id in background.message) {
        if (background.message[id]) {
          if ((typeof background.message[id]) === "function") {
            if (e.path === "background-to-popup") {
              if (e.method === id) {
                background.message[id](e.data);
              }
            }
          }
        }
      }
    }
  }
};

var config = {
  "prevent": {
    "drop": function (e) {
      if (e.target.id.indexOf("fileio") !== -1) return;
      e.preventDefault();
    }
  },
  "addon": {
    "homepage": function () {
      return chrome.runtime.getManifest().homepage_url;
    }
  },
  "app": {
    "start": function () {
      const theme = config.storage.read("theme") !== undefined ? config.storage.read("theme") : "light";
      document.documentElement.setAttribute("theme", theme !== undefined ? theme : "light");
    }
  },
  "resize": {
    "timeout": null,
    "method": function () {
      if (config.port.name === "win") {
        if (config.resize.timeout) window.clearTimeout(config.resize.timeout);
        config.resize.timeout = window.setTimeout(async function () {
          const current = await chrome.windows.getCurrent();
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
      const context = document.documentElement.getAttribute("context");
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
          let tmp = {};
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
        const filelist = document.getElementById("filelist");
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
              const li = document.createElement("li");
              li.textContent = "> " + file.filename;
              li.setAttribute("class", "folder");
              if (file.offset === 0) li.setAttribute("root", '');
              filelist.appendChild(li);
            } else {
              const li = document.createElement("li");
              li.setAttribute("path", file.filename);
              li.setAttribute("class", "file");
      				li.textContent = file.filename;
              config.zip.files.push(file);
      				filelist.appendChild(li);
              /*  */
      				li.addEventListener("click", async function (e) {
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
    "permission": undefined,
    "initiate": async function (callback) {
      config.fileio.api = window.showDirectoryPicker ? "supported" : "unsupported";
      if (config.fileio.api === "supported") {
        try {
          if (!config.fileio.picker) config.fileio.picker = await window.showDirectoryPicker();
          config.fileio.permission = await config.fileio.picker.requestPermission({"mode": "readwrite"});
        } catch (e) {
          //
        }
      } else {
        if (chrome && chrome.permissions) {
          const flag = await chrome.permissions.request({"permissions": ["downloads"]});
          config.download.permission = flag === true || flag === "granted" ? "granted" : "denied";
        }
      }
      /*  */
      if (callback) callback();
    },
    "start": async function (blob, path, filename, callback) {
      if (config.fileio.permission === "granted") {
        try {
          const root = config.fileio.picker;
          const arr = path.split('/');
          const name = arr.pop();
          let subdir = null;
          /*  */
          for (let i = 0; i < arr.length; i++) {
            const target = subdir ? subdir : root;
            subdir = await target.getDirectoryHandle(arr[i], {"create": true});
          }
          /*  */
          const target = subdir ? subdir : root;
          const file = await target.getFileHandle(name, {"create": true});
          const writable = await file.createWritable();
          /*  */
          await writable.write(blob);
          writable.close();
        } catch (e) {
          config.zip.onerror("Error >> FileSystem API");
        }
      } else {
        const url = URL.createObjectURL(blob);
        /*  */
        if (config.download.permission === "granted") {
          try {
            await chrome.downloads.download({"url": url, "filename": path});
          } catch (e) {
            config.zip.onerror("Error >> Downloads API");
          }
        } else {
          const a = document.createElement('a');
          a.setAttribute("download", path);
          a.setAttribute("href", url);
          a.click();
          /*  */
          URL.revokeObjectURL(url);
        }
      }
      /*  */
      const filelist = document.getElementById("filelist");
      const li = filelist.querySelector("li[class='file'][path='" + filename + "']");
      const progress = li ? li.querySelector("progress") : null;
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
        const progress = document.createElement("progress");
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
        zip.configure({"useWebWorkers": navigator.userAgent.indexOf("Firefox") === -1});
        /*  */
        const reader = new zip.ZipReader(new zip.BlobReader(file));
        if (reader) {
          const entries = await reader.getEntries();
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
        zip.configure({"useWebWorkers": navigator.userAgent.indexOf("Firefox") === -1});
        /*  */
        const buffer = await entry.getData(new zip.BlobWriter(), { 
          "onprogress": function (current, total) {
            config.zip.onprogress(current, total, target);
          }
        });
        /*  */
        if (buffer) {
          const type = zip.getMimeType(entry.filename);
          if (type) {
            const blob = new Blob([buffer], {"type": type});
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
    const theme = document.getElementById("theme");
    const fileio = document.getElementById("fileio");
    const reload = document.getElementById("reload");
    const support = document.getElementById("support");
    const donation = document.getElementById("donation");
    const download = document.getElementById("download");
    const filename = document.getElementById("filename");
    /*  */
    reload.addEventListener("click", function () {
      document.location.reload();
    });
    /*  */
    support.addEventListener("click", function () {
      if (config.port.name !== "webapp") {
        const url = config.addon.homepage();
        chrome.tabs.create({"url": url, "active": true});
      }
    }, false);
    /*  */
    donation.addEventListener("click", function () {
      if (config.port.name !== "webapp") {
        const url = config.addon.homepage() + "?reason=support";
        chrome.tabs.create({"url": url, "active": true});
      }
    }, false);
    /*  */
    theme.addEventListener("click", function () {
      let attribute = document.documentElement.getAttribute("theme");
      attribute = attribute === "dark" ? "light" : "dark";
      /*  */
      document.documentElement.setAttribute("theme", attribute);
      config.storage.write("theme", attribute);
    }, false);
    /*  */
    fileio.addEventListener("change", function (e) {
      if (e.target) {
        if (e.target.files) {
          if (e.target.files.length) {
            const file = e.target.files[0];
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
            const loop = function (file) {
              const filelist = document.getElementById("filelist");
              const path = (filename.value ? filename.value + '/' : '') + file.filename;
              const li = filelist.querySelector("li[class='file'][path='" + file.filename + "']");
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
    config.storage.load(config.app.start);
    window.removeEventListener("load", config.load, false);
  }
};

config.port.connect();

document.addEventListener("drop", config.prevent.drop, true);
document.addEventListener("dragover", config.prevent.drop, true);

window.addEventListener("load", config.load, false);
window.addEventListener("resize", config.resize.method, false);
