/**
 * Axil ORM Studio — Single-file HTML UI
 * Professional light theme with full features.
 */

export function generateHTML(data: {
  appName:    string
  appUrl:     string
  studioPort: number
  qrDataUrl:  string
}): string {
  const PAGE_SIZE = 50

  const scriptContent = `
    "use strict";

    var PAGE_SIZE   = ${PAGE_SIZE};
    var APP_URL     = "${data.appUrl}";
    var STUDIO_PORT = ${data.studioPort};

    var STATE = {
      data:           null,
      tableRows:      {},
      tablePage:      {},
      selectedTable:  null,
      routeFilter:    "",
      methodFilter:   "ALL",
      tableFilter:    "",
      openGroups:     {},
      wsConnections:  {},
      sseConnections: {}
    };

    function escHtml(s) {
      return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    function escAttr(s) {
      return String(s==null?"":s).replace(/&/g,"&amp;").replace(/'/g,"&#39;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }

    function timeStr() {
      return new Date().toTimeString().slice(0,8);
    }

    function toast(msg, type) {
      var c = document.getElementById("toast-container");
      if(!c) return;
      var el = document.createElement("div");
      el.className = "toast toast-" + (type||"info");
      el.innerHTML = '<span class="toast-msg">'+escHtml(msg)+'</span>';
      c.appendChild(el);
      setTimeout(function(){ el.classList.add("show") }, 10);
      setTimeout(function(){ el.classList.remove("show"); setTimeout(function(){ el.remove() }, 300) }, 3500);
    }

    function fetchData() {
      return fetch("/api/studio/data").then(function(r){
        if(!r.ok) throw new Error("HTTP "+r.status);
        return r.json();
      });
    }

    function renderAll() {
      if(!STATE.data) return;
      renderStats();
      renderOverview();
      renderRoutes();
      renderTableNav();
      renderWebSockets();
      renderSSE();
      renderCollections();
      updateBadges();
    }

    /* ================================================================
       STATS
       ================================================================ */
    function renderStats() {
      var d = STATE.data;
      var totalRows = d.tables.reduce(function(a,t){ return a+(t.rowCount||0) },0);
      var secRoutes = d.routes.filter(function(r){ return r.middleware && r.middleware.indexOf("authenticate")!==-1 }).length;
      var stats = [
        {v:d.routes.length, l:"API Endpoints", c:"blue"},
        {v:d.tables.length, l:"DB Tables", c:"green"},
        {v:d.websockets.length+d.sse.length, l:"Realtime", c:"purple"},
        {v:totalRows.toLocaleString(), l:"Total Rows", c:"orange"},
        {v:secRoutes, l:"Secured Routes", c:"red"}
      ];
      var el = document.getElementById("stats-grid");
      if(!el) return;
      el.innerHTML = stats.map(function(s){
        return '<div class="stat-card"><div class="stat-value '+s.c+'">'+s.v+'</div><div class="stat-label">'+s.l+'</div></div>';
      }).join("");
    }

    /* ================================================================
       OVERVIEW
       ================================================================ */
    function renderOverview() {
      var d = STATE.data;

      var routesEl = document.getElementById("ov-routes-list");
      if(routesEl) {
        routesEl.innerHTML = d.routes.length ? d.routes.slice(0,8).map(function(r){
          return '<div class="ov-item" onclick="showPanel(&#39;routes&#39;)"><span class="method-pill method-'+r.method+'">'+r.method+'</span><span class="ov-path">'+escHtml(r.path)+'</span><span class="ov-handler">'+escHtml(r.handler||"")+'</span></div>';
        }).join("") : '<div class="empty-msg">No endpoints discovered</div>';
      }

      var dbEl = document.getElementById("ov-db-list");
      if(dbEl) {
        dbEl.innerHTML = d.tables.length ? d.tables.slice(0,8).map(function(t){
          return '<div class="ov-item" onclick="openTable(&#39;'+escAttr(t.name)+'&#39;)"><span class="ov-dot"></span><span class="ov-path">'+escHtml(t.name)+'</span><span class="ov-handler">'+(t.rowCount||0)+' rows</span></div>';
        }).join("") : '<div class="empty-msg">No database connected</div>';
      }

      var rtEl = document.getElementById("ov-rt-list");
      if(rtEl) {
        var items = d.websockets.map(function(w){ return {path:w.path,type:"WS"} }).concat(d.sse.map(function(s){ return {path:s.path,type:"SSE"} }));
        rtEl.innerHTML = items.length ? items.map(function(it){
          return '<div class="ov-item"><span class="rt-badge rt-'+it.type.toLowerCase()+'">'+it.type+'</span><span class="ov-path">'+escHtml(it.path)+'</span></div>';
        }).join("") : '<div class="empty-msg">No realtime endpoints</div>';
      }
    }

    /* ================================================================
       ROUTES
       ================================================================ */
    function filterRoutes(q) {
      STATE.routeFilter = (q||"").toLowerCase();
      renderRoutes();
    }

    function setMethodFilter(m) {
      STATE.methodFilter = m;
      document.querySelectorAll(".mf-btn").forEach(function(b){
        b.classList.toggle("mf-active", b.getAttribute("data-m")===m);
      });
      renderRoutes();
    }

    function renderRoutes() {
      var routes = (STATE.data && STATE.data.routes)||[];
      var filtered = routes.filter(function(r){
        var mOk = STATE.methodFilter==="ALL"||r.method===STATE.methodFilter;
        var q = STATE.routeFilter;
        var tOk = !q || r.method.toLowerCase().indexOf(q)!==-1 || r.path.toLowerCase().indexOf(q)!==-1 || (r.handler||"").toLowerCase().indexOf(q)!==-1;
        return mOk && tOk;
      });

      var sub = document.getElementById("routes-subtitle");
      if(sub) sub.textContent = filtered.length+" of "+routes.length+" endpoints";

      var container = document.getElementById("routes-container");
      if(!container) return;

      if(!filtered.length) {
        container.innerHTML = '<div class="empty-msg">No endpoints match</div>';
        return;
      }

      var groups = {};
      var order = [];
      filtered.forEach(function(r){
        var parts = r.path.split("/").filter(function(p){ return p.length>0 });
        var prefix = parts.length>0 ? "/"+parts[0] : "/";
        if(!groups[prefix]){ groups[prefix]=[]; order.push(prefix); }
        groups[prefix].push(r);
      });

      container.innerHTML = order.map(function(group){
        var rs = groups[group];
        var gKey = group.replace(/[^a-z0-9]/gi,"-");
        var isOpen = STATE.openGroups[group] !== false;

        return '<div class="route-group">'+
          '<div class="rg-header" onclick="toggleGroup(&#39;'+escAttr(group)+'&#39;)">'+
            '<span class="rg-dot"></span>'+
            '<span class="rg-name">'+escHtml(group)+'</span>'+
            '<span class="rg-count">'+rs.length+'</span>'+
            '<span class="rg-chevron'+(isOpen?" open":"")+'">&#9656;</span>'+
          '</div>'+
          '<div class="rg-body'+(isOpen?" open":"")+'">'+
            rs.map(function(r){ return renderRouteItem(r) }).join("")+
          '</div></div>';
      }).join("");
    }

    function toggleGroup(group) {
      STATE.openGroups[group] = STATE.openGroups[group]===false ? true : false;
      renderRoutes();
    }

    function renderRouteItem(r) {
      var rId = "ri-"+Math.random().toString(36).slice(2,10);
      var mw = r.middleware||[];
      var hasBody = ["POST","PUT","PATCH"].indexOf(r.method)!==-1;
      var params = (r.path.match(/:([a-zA-Z_]\\w*)/g)||[]).map(function(p){ return p.slice(1) });
      var sampleBody = JSON.stringify(getSampleBody(r),null,2);
      var sampleResp = JSON.stringify(getSampleResponse(r),null,2);

      var paramHtml = params.length ? params.map(function(p){
        return '<div class="param-row"><span class="param-name">:'+escHtml(p)+'</span><span class="param-type">string</span><span class="param-req">required</span></div>';
      }).join("") : '<div class="param-empty">No path parameters</div>';

      var bodyHtml = hasBody ?
        '<div class="detail-section"><div class="detail-label">REQUEST BODY</div><pre class="code-block">'+escHtml(sampleBody)+'</pre></div>' :
        '<div class="detail-section"><div class="detail-label">REQUEST BODY</div><div class="param-empty">No body for '+r.method+'</div></div>';

      return '<div class="route-item" id="'+rId+'">'+
        '<div class="ri-header" onclick="document.getElementById(&#39;'+rId+'&#39;).classList.toggle(&#39;expanded&#39;)">'+
          '<span class="method-pill method-'+r.method+'">'+r.method+'</span>'+
          '<span class="ri-path">'+highlightParams(r.path)+'</span>'+
          '<span class="ri-tags">'+mw.map(function(m){ return '<span class="mw-tag mw-'+tagCls(m)+'">'+escHtml(m)+'</span>' }).join("")+'</span>'+
          '<span class="ri-handler">'+escHtml(r.handler||"")+'</span>'+
        '</div>'+
        '<div class="ri-body" onclick="event.stopPropagation()">'+
          '<div class="ri-meta-bar">'+
            '<span class="ri-meta-label">Handler:</span>'+
            '<code class="ri-meta-code">'+escHtml(r.handler||"anonymous")+'</code>'+
            (mw.length ? '<span class="ri-meta-label" style="margin-left:12px">Middleware:</span>'+mw.map(function(m){ return '<span class="mw-tag mw-'+tagCls(m)+'">'+escHtml(m)+'</span>' }).join("") : "")+
          '</div>'+
          '<div class="ri-detail-grid">'+
            '<div class="detail-section"><div class="detail-label">PARAMETERS</div>'+paramHtml+'</div>'+
            '<div class="detail-section"><div class="detail-label">RESPONSES</div>'+
              renderResponseCodes()+
            '</div>'+
            bodyHtml+
            '<div class="detail-section"><div class="detail-label">SAMPLE RESPONSE</div><pre class="code-block">'+escHtml(sampleResp)+'</pre></div>'+
          '</div>'+
          '<div class="ri-try-bar">'+
            '<button class="btn btn-sm btn-outline" onclick="toggleTry(&#39;'+rId+'&#39;)">&#9654; Try it</button>'+
          '</div>'+
          '<div class="ri-try-panel" id="try-'+rId+'" style="display:none">'+
            '<div class="try-form">'+
              '<label class="try-label">URL</label>'+
              '<input class="try-input" id="try-url-'+rId+'" value="'+escAttr(APP_URL+r.path)+'" />'+
              '<label class="try-label">Authorization</label>'+
              '<input class="try-input" id="try-auth-'+rId+'" placeholder="Bearer token..." />'+
              (hasBody ? '<label class="try-label">Body (JSON)</label><textarea class="try-input try-textarea" id="try-body-'+rId+'">'+escHtml(sampleBody)+'</textarea>' : "")+
              '<button class="btn btn-sm btn-primary" onclick="execRequest(&#39;'+rId+'&#39;,&#39;'+r.method+'&#39;,'+hasBody+')">Send</button>'+
            '</div>'+
            '<div id="try-result-'+rId+'" class="try-result"></div>'+
          '</div>'+
        '</div></div>';
    }

    function toggleTry(rId) {
      var el = document.getElementById("try-"+rId);
      if(el) el.style.display = el.style.display==="none" ? "block" : "none";
    }

    function execRequest(rId, method, hasBody) {
      var url = document.getElementById("try-url-"+rId).value;
      var auth = document.getElementById("try-auth-"+rId).value;
      var bodyEl = document.getElementById("try-body-"+rId);
      var resEl = document.getElementById("try-result-"+rId);
      var headers = {"Content-Type":"application/json"};
      if(auth) headers["Authorization"] = auth;
      var opts = {method:method, headers:headers};
      if(hasBody && bodyEl) opts.body = bodyEl.value;

      resEl.innerHTML = '<div class="try-loading">Sending...</div>';
      var start = Date.now();

      fetch(url, opts).then(function(resp){
        var elapsed = Date.now()-start;
        var cls = resp.status<300?"res-ok":resp.status<500?"res-warn":"res-err";
        return resp.text().then(function(text){
          var display = text;
          try { display = JSON.stringify(JSON.parse(text),null,2); } catch(e){}
          resEl.innerHTML = '<div class="try-res-header"><span class="res-status '+cls+'">'+resp.status+' '+escHtml(resp.statusText)+'</span><span class="res-time">'+elapsed+'ms</span></div><pre class="code-block">'+escHtml(display)+'</pre>';
        });
      }).catch(function(e){
        resEl.innerHTML = '<div class="try-res-header"><span class="res-status res-err">Network Error</span></div><pre class="code-block">'+escHtml(e.message)+'</pre>';
      });
    }

    function highlightParams(path) {
      return escHtml(path).replace(/:([a-zA-Z_]\\w*)/g,'<span class="path-param">:$1</span>');
    }

    function tagCls(m) {
      if(m.indexOf("auth")!==-1) return "auth";
      if(m.indexOf("valid")!==-1) return "validate";
      if(m.indexOf("rate")!==-1||m.indexOf("throttle")!==-1) return "rate";
      if(m.indexOf("cors")!==-1) return "cors";
      return "default";
    }

    function getSampleBody(r) {
      var p = r.path.toLowerCase();
      if(p.indexOf("login")!==-1) return {email:"user@example.com",password:"password123"};
      if(p.indexOf("user")!==-1) return {name:"John Doe",email:"john@example.com"};
      if(p.indexOf("post")!==-1) return {title:"My Post",content:"Content here"};
      return {key:"value"};
    }

    function getSampleResponse(r) {
      if(r.method==="DELETE") return {success:true,message:"Deleted"};
      if(r.path.toLowerCase().indexOf("login")!==-1) return {token:"eyJ...",user:{id:1}};
      return {status:200,data:null,message:"OK"};
    }

    function renderResponseCodes() {
      var codes = [{c:"200",d:"Success",k:"ok"},{c:"400",d:"Bad Request",k:"warn"},{c:"401",d:"Unauthorized",k:"warn"},{c:"404",d:"Not Found",k:"warn"},{c:"500",d:"Server Error",k:"err"}];
      return codes.map(function(r){
        return '<div class="res-code-row"><span class="res-code res-'+r.k+'">'+r.c+'</span><span>'+r.d+'</span></div>';
      }).join("");
    }

    /* ================================================================
       DATABASE
       ================================================================ */
    function filterTables(q) {
      STATE.tableFilter = (q||"").toLowerCase();
      renderTableNav();
    }

    function renderTableNav() {
      var tables = (STATE.data&&STATE.data.tables)||[];
      var filtered = STATE.tableFilter ? tables.filter(function(t){ return t.name.toLowerCase().indexOf(STATE.tableFilter)!==-1 }) : tables;
      var el = document.getElementById("table-nav-list");
      if(!el) return;

      var countEl = document.getElementById("table-count");
      if(countEl) countEl.textContent = filtered.length+" of "+tables.length;

      el.innerHTML = filtered.length ? filtered.map(function(t){
        var sel = STATE.selectedTable===t.name ? " tn-selected":"";
        return '<div class="tn-item'+sel+'" onclick="openTable(&#39;'+escAttr(t.name)+'&#39;)"><span class="tn-name">'+escHtml(t.name)+'</span><span class="tn-count">'+(t.rowCount||0)+'</span></div>';
      }).join("") : '<div class="empty-msg" style="padding:12px">No tables</div>';
    }

    function openTable(name) {
      STATE.selectedTable = name;
      STATE.tablePage[name] = STATE.tablePage[name]||0;
      showPanel("database");
      renderTableNav();

      var main = document.getElementById("db-main-content");
      if(!main) return;
      main.innerHTML = '<div class="loading-msg">Loading '+escHtml(name)+'...</div>';

      var table = (STATE.data.tables||[]).find(function(t){ return t.name===name });
      var offset = STATE.tablePage[name] * PAGE_SIZE;

      fetch("/api/studio/table/"+encodeURIComponent(name)+"?limit="+PAGE_SIZE+"&offset="+offset)
        .then(function(r){ return r.json() })
        .then(function(rowData){
          STATE.tableRows[name] = rowData;
          var cols = (table&&table.columns)||[];

          var schemaHtml = cols.length ? '<table class="schema-tbl"><thead><tr><th>#</th><th>Column</th><th>Type</th><th>Constraints</th><th>Default</th></tr></thead><tbody>'+
            cols.map(function(c,i){
              var flags = [];
              if(c.primary) flags.push('<span class="flag flag-pk">PK</span>');
              if(c.unique&&!c.primary) flags.push('<span class="flag flag-uq">UNIQUE</span>');
              if(!c.nullable) flags.push('<span class="flag flag-nn">NOT NULL</span>');
              else flags.push('<span class="flag flag-null">NULLABLE</span>');
              return '<tr><td class="row-num">'+(i+1)+'</td><td class="col-name">'+(c.primary?"&#128273; ":"")+escHtml(c.name)+'</td><td class="col-type">'+escHtml(c.type||"?")+'</td><td>'+flags.join(" ")+'</td><td class="col-default">'+(c.default!=null?escHtml(String(c.default)):"&#8212;")+'</td></tr>';
            }).join("")+
            '</tbody></table>' : '<div class="empty-msg">No schema info</div>';

          var dataHtml = renderDataTable(rowData.rows);
          var paginationHtml = renderPagination(name, rowData.total);

          main.innerHTML =
            '<div class="card"><div class="card-hdr">'+
              '<span class="card-title">&#128451; '+escHtml(name)+'</span>'+
              '<span class="card-meta">'+cols.length+' cols &middot; '+(table&&table.rowCount||0).toLocaleString()+' rows</span>'+
            '</div><div class="card-flush">'+schemaHtml+'</div></div>'+
            '<div class="card"><div class="card-hdr">'+
              '<span class="card-title">Data</span>'+
              '<span class="card-meta">'+rowData.rows.length+' of '+rowData.total.toLocaleString()+'</span>'+
              '<button class="btn btn-xs btn-outline" style="margin-left:auto" onclick="exportCSV(&#39;'+escAttr(name)+'&#39;)">Export CSV</button>'+
            '</div><div class="card-flush">'+dataHtml+'</div>'+paginationHtml+'</div>';
        })
        .catch(function(e){
          main.innerHTML = '<div class="empty-msg" style="color:#dc2626">Failed: '+escHtml(e.message)+'</div>';
        });
    }

    function renderDataTable(rows) {
      if(!rows||!rows.length) return '<div class="empty-msg">Empty table</div>';
      var headers = Object.keys(rows[0]);
      return '<div class="dt-wrap"><table class="data-tbl"><thead><tr><th class="row-num">#</th>'+
        headers.map(function(h){ return '<th>'+escHtml(h)+'</th>' }).join("")+
        '</tr></thead><tbody>'+
        rows.map(function(row,i){
          return '<tr><td class="row-num">'+(i+1)+'</td>'+headers.map(function(h){ return '<td>'+fmtCell(row[h])+'</td>' }).join("")+'</tr>';
        }).join("")+
        '</tbody></table></div>';
    }

    function fmtCell(val) {
      if(val===null||val===undefined) return '<span class="cell-null">NULL</span>';
      if(val===true) return '<span class="cell-true">true</span>';
      if(val===false) return '<span class="cell-false">false</span>';
      if(typeof val==="number") return '<span class="cell-num">'+val+'</span>';
      var s = String(val);
      return escHtml(s.length>80?s.slice(0,80)+"\\u2026":s);
    }

    function renderPagination(name, total) {
      var page = STATE.tablePage[name]||0;
      var last = Math.max(0, Math.ceil(total/PAGE_SIZE)-1);
      var from = total===0?0:page*PAGE_SIZE+1;
      var to = Math.min((page+1)*PAGE_SIZE, total);
      return '<div class="pag"><span class="pag-info">'+from+' \\u2013 '+to+' of '+total+'</span><div class="pag-btns">'+
        '<button class="pag-btn"'+(page===0?" disabled":"")+ ' onclick="changePage(&#39;'+escAttr(name)+'&#39;,'+(page-1)+')">&#9664;</button>'+
        '<span class="pag-cur">Page '+(page+1)+'</span>'+
        '<button class="pag-btn"'+(page>=last?" disabled":"")+ ' onclick="changePage(&#39;'+escAttr(name)+'&#39;,'+(page+1)+')">&#9654;</button>'+
      '</div></div>';
    }

    function changePage(name, page) {
      STATE.tablePage[name] = page;
      openTable(name);
    }

    function exportCSV(name) {
      var data = STATE.tableRows[name];
      if(!data||!data.rows||!data.rows.length){ toast("No data","warn"); return; }
      var h = Object.keys(data.rows[0]);
      var csv = [h.join(",")].concat(data.rows.map(function(r){ return h.map(function(k){ return JSON.stringify(r[k]!=null?r[k]:"") }).join(",") })).join("\\n");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
      a.download = name+".csv";
      a.click();
      toast("CSV exported","success");
    }

    /* ================================================================
       SQL QUERY
       ================================================================ */
    function runQuery() {
      var sql = document.getElementById("sql-input").value.trim();
      if(!sql){ toast("Enter SQL","warn"); return; }
      var resEl = document.getElementById("query-result");
      var timeEl = document.getElementById("query-time");
      resEl.innerHTML = '<div class="loading-msg">Executing...</div>';
      timeEl.textContent = "";
      var start = Date.now();
      fetch("/api/studio/query",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sql:sql})})
        .then(function(r){ return r.json() })
        .then(function(data){
          timeEl.textContent = (Date.now()-start)+"ms";
          if(data.error){ resEl.innerHTML='<div class="query-err">'+escHtml(data.error)+'</div>'; return; }
          resEl.innerHTML = data.rows&&data.rows.length ? renderDataTable(data.rows) : '<div class="empty-msg">No rows. Affected: '+(data.affected||0)+'</div>';
        })
        .catch(function(e){
          timeEl.textContent = "";
          resEl.innerHTML='<div class="query-err">'+escHtml(e.message)+'</div>';
        });
    }

    /* ================================================================
       WEBSOCKETS
       ================================================================ */
    function renderWebSockets() {
      var ws = (STATE.data&&STATE.data.websockets)||[];
      var el = document.getElementById("ws-section");
      if(!el) return;
      if(!ws.length){ el.innerHTML='<div class="empty-msg">No WebSocket endpoints detected</div>'; return; }
      var port = APP_URL.split(":").pop();
      el.innerHTML = ws.map(function(w,idx){
        var wId = "ws-"+idx;
        var url = "ws://localhost:"+port+w.path;
        return '<div class="rt-card"><div class="rt-header"><span class="rt-badge rt-ws">WS</span><span class="rt-path">'+escHtml(w.path)+'</span><span class="rt-status" id="wss-'+wId+'">&#9679; Idle</span></div>'+
          '<div class="rt-body">'+
            '<div class="rt-label">Events</div>'+
            '<div class="rt-events">'+(w.events&&w.events.length?w.events.map(function(e){return '<span class="ev-chip">'+escHtml(e)+'</span>'}).join(""):'<span class="empty-inline">None</span>')+'</div>'+
            '<div class="rt-label">URL</div>'+
            '<div class="rt-url">'+escHtml(url)+'</div>'+
            '<div class="rt-label">Log</div>'+
            '<div class="rt-log" id="log-'+wId+'"><div class="log-line"><span class="log-time">'+timeStr()+'</span><span class="log-sys">SYS</span> Ready</div></div>'+
            '<div class="rt-controls">'+
              '<input class="rt-input" id="msg-'+wId+'" placeholder=&#39;{"type":"ping"}&#39; />'+
              '<button class="btn btn-xs btn-green" onclick="wsSend(&#39;'+wId+'&#39;)">Send</button>'+
              '<button class="btn btn-xs btn-outline" onclick="wsConnect(&#39;'+wId+'&#39;,&#39;'+escAttr(w.path)+'&#39;)">Connect</button>'+
              '<button class="btn btn-xs btn-ghost" onclick="wsDisconnect(&#39;'+wId+'&#39;)">Disconnect</button>'+
            '</div>'+
          '</div></div>';
      }).join("");
    }

    function wsConnect(wId, path) {
      if(STATE.wsConnections[wId]){ toast("Already connected","warn"); return; }
      var port = APP_URL.split(":").pop();
      var url = "ws://localhost:"+port+path;
      try {
        var ws = new WebSocket(url);
        STATE.wsConnections[wId] = ws;
        ws.onopen = function(){ wsLog(wId,"SYS","Connected"); setWsStatus(wId,"on") };
        ws.onmessage = function(e){ wsLog(wId,"IN",e.data) };
        ws.onerror = function(){ wsLog(wId,"SYS","Error"); setWsStatus(wId,"err") };
        ws.onclose = function(){ wsLog(wId,"SYS","Disconnected"); setWsStatus(wId,"off"); delete STATE.wsConnections[wId] };
      } catch(e){ wsLog(wId,"SYS","Failed: "+e.message) }
    }

    function wsDisconnect(wId) {
      var ws = STATE.wsConnections[wId];
      if(ws){ ws.close(); delete STATE.wsConnections[wId]; }
    }

    function wsSend(wId) {
      var ws = STATE.wsConnections[wId];
      var inp = document.getElementById("msg-"+wId);
      if(!ws||ws.readyState!==1){ toast("Not connected","warn"); return; }
      if(!inp.value){ toast("Enter message","warn"); return; }
      ws.send(inp.value);
      wsLog(wId,"OUT",inp.value);
    }

    function wsLog(wId, dir, msg) {
      var log = document.getElementById("log-"+wId);
      if(!log) return;
      var cls = dir==="IN"?"log-in":dir==="OUT"?"log-out":"log-sys";
      var div = document.createElement("div");
      div.className = "log-line";
      div.innerHTML = '<span class="log-time">'+timeStr()+'</span><span class="'+cls+'">'+dir+'</span> '+escHtml(String(msg).slice(0,200));
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
      while(log.children.length>80) log.removeChild(log.firstChild);
    }

    function setWsStatus(wId, state) {
      var el = document.getElementById("wss-"+wId);
      if(!el) return;
      var colors = {on:"#10b981",off:"#64748b",err:"#ef4444"};
      var labels = {on:"Connected",off:"Disconnected",err:"Error"};
      el.innerHTML = '<span style="color:'+colors[state]+'">&#9679;</span> '+labels[state];
    }

    /* ================================================================
       SSE
       ================================================================ */
    function renderSSE() {
      var sse = (STATE.data&&STATE.data.sse)||[];
      var el = document.getElementById("sse-section");
      if(!el) return;
      if(!sse.length){ el.innerHTML='<div class="empty-msg">No SSE endpoints detected</div>'; return; }
      el.innerHTML = sse.map(function(s,idx){
        var sId = "sse-"+idx;
        return '<div class="rt-card"><div class="rt-header"><span class="rt-badge rt-sse">SSE</span><span class="rt-path">'+escHtml(s.path)+'</span><span class="rt-status" id="sss-'+sId+'">&#9679; Idle</span></div>'+
          '<div class="rt-body">'+
            '<div class="rt-label">Events</div>'+
            '<div class="rt-events">'+(s.events&&s.events.length?s.events.map(function(e){return '<span class="ev-chip">'+escHtml(e)+'</span>'}).join(""):'<span class="empty-inline">None</span>')+'</div>'+
            '<div class="rt-label">Stream Log</div>'+
            '<div class="rt-log" id="slog-'+sId+'"><div class="log-line"><span class="log-sys">SYS</span> Waiting...</div></div>'+
            '<div class="rt-controls">'+
              '<button class="btn btn-xs btn-green" onclick="sseConnect(&#39;'+sId+'&#39;,&#39;'+escAttr(s.path)+'&#39;)">Listen</button>'+
              '<button class="btn btn-xs btn-outline" onclick="sseDisconnect(&#39;'+sId+'&#39;)">Stop</button>'+
            '</div>'+
          '</div></div>';
      }).join("");
    }

    function sseConnect(sId, path) {
      if(STATE.sseConnections[sId]){ toast("Already listening","warn"); return; }
      var es = new EventSource(APP_URL+path);
      STATE.sseConnections[sId] = es;
      var statusEl = document.getElementById("sss-"+sId);
      if(statusEl) statusEl.innerHTML='<span style="color:#10b981">&#9679;</span> Listening';
      es.onmessage = function(e){ sseLog(sId,"MSG",e.data) };
      es.onerror = function(){ sseLog(sId,"ERR","Stream closed"); if(statusEl) statusEl.innerHTML='<span style="color:#ef4444">&#9679;</span> Error'; es.close(); delete STATE.sseConnections[sId] };
      toast("SSE connected","success");
    }

    function sseDisconnect(sId) {
      var es = STATE.sseConnections[sId];
      if(es){ es.close(); delete STATE.sseConnections[sId]; }
      var statusEl = document.getElementById("sss-"+sId);
      if(statusEl) statusEl.innerHTML='<span style="color:#64748b">&#9679;</span> Idle';
    }

    function sseLog(sId, type, msg) {
      var log = document.getElementById("slog-"+sId);
      if(!log) return;
      var div = document.createElement("div");
      div.className = "log-line";
      div.innerHTML = '<span class="log-time">'+timeStr()+'</span><span class="'+(type==="ERR"?"log-sys":"log-in")+'">'+type+'</span> '+escHtml(String(msg).slice(0,300));
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    /* ================================================================
       COLLECTIONS
       ================================================================ */
    function renderCollections() {
      var count = (STATE.data&&STATE.data.routes&&STATE.data.routes.length)||0;
      ["postman-count","insomnia-count","openapi-count"].forEach(function(id){
        var el = document.getElementById(id);
        if(el) el.textContent = count+" endpoints";
      });

      var tbody = document.getElementById("preview-tbody");
      if(!tbody) return;
      var routes = STATE.data.routes||[];
      tbody.innerHTML = routes.length ? routes.map(function(r){
        return '<tr><td><span class="method-pill method-'+r.method+'">'+r.method+'</span></td><td class="mono">'+highlightParams(r.path)+'</td><td class="mono muted">'+escHtml(r.handler||"\\u2014")+'</td></tr>';
      }).join("") : '<tr><td colspan="3"><div class="empty-msg">No endpoints</div></td></tr>';
    }

    function downloadPostman() {
      fetch("/api/studio/export/postman").then(function(r){return r.json()}).then(function(d){ dlJSON(d,"postman-collection.json"); toast("Downloaded","success") }).catch(function(e){ toast(e.message,"error") });
    }
    function downloadInsomnia() {
      fetch("/api/studio/export/insomnia").then(function(r){return r.json()}).then(function(d){ dlJSON(d,"insomnia-collection.json"); toast("Downloaded","success") }).catch(function(e){ toast(e.message,"error") });
    }
    function downloadOpenAPI() {
      fetch("/api/studio/export/openapi").then(function(r){return r.json()}).then(function(d){ dlJSON(d,"openapi.json"); toast("Downloaded","success") }).catch(function(e){ toast(e.message,"error") });
    }
    function dlJSON(data,name) {
      var a=document.createElement("a");
      a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
      a.download=name; a.click();
    }

    /* ================================================================
       DB SUB-TABS
       ================================================================ */
    function showDbSub(name) {
      ["tables","query"].forEach(function(s){
        var p=document.getElementById("dbsub-"+s);
        var b=document.getElementById("dbnav-"+s);
        if(p) p.style.display = s===name?"block":"none";
        if(b) b.classList.toggle("dbnav-active",s===name);
      });
    }

    /* ================================================================
       NAVIGATION
       ================================================================ */
    var LABELS = {overview:"Overview",routes:"API Endpoints",database:"Database",realtime:"Realtime",collections:"Collections",qr:"QR Access"};

    function showPanel(name) {
      document.querySelectorAll(".tab-panel").forEach(function(p){ p.classList.remove("active") });
      document.querySelectorAll(".nav-link").forEach(function(n){ n.classList.remove("active") });
      var panel = document.getElementById("panel-"+name);
      var nav = document.getElementById("nav-"+name);
      if(panel) panel.classList.add("active");
      if(nav) nav.classList.add("active");
      var label = document.getElementById("topbar-label");
      if(label) label.textContent = LABELS[name]||name;
    }

    function updateBadges() {
      var d = STATE.data;
      if(!d) return;
      var b=function(id,v){var el=document.getElementById(id);if(el) el.textContent=v};
      b("badge-routes",d.routes.length);
      b("badge-tables",d.tables.length);
      b("badge-rt",d.websockets.length+d.sse.length);
    }

    function handleRefresh() {
      var btn = document.getElementById("refresh-btn");
      if(btn){ btn.disabled=true; btn.textContent="..." }
      fetchData().then(function(d){ STATE.data=d; renderAll(); toast("Refreshed","success") })
        .catch(function(e){ toast("Failed: "+e.message,"error") })
        .finally(function(){ if(btn){ btn.disabled=false; btn.textContent="Refresh" } });
    }

    function copyUrl(url) {
      if(navigator.clipboard) navigator.clipboard.writeText(url).then(function(){toast("Copied","success")});
    }

    /* ================================================================
       QR
       ================================================================ */
    function loadStudioQR() {
      fetch("/api/studio/qr?url="+encodeURIComponent("http://localhost:"+STUDIO_PORT))
        .then(function(r){return r.json()})
        .then(function(d){
          var el=document.getElementById("studio-qr-body");
          if(el&&d.qrDataUrl) el.innerHTML='<img src="'+d.qrDataUrl+'" style="width:180px;border-radius:8px" /><p style="margin-top:12px;font-family:monospace;font-size:12px;color:#2563eb">http://localhost:'+STUDIO_PORT+'</p><button class="btn btn-xs btn-outline" onclick="copyUrl(&#39;http://localhost:'+STUDIO_PORT+'&#39;)">Copy URL</button>';
        })
        .catch(function(){
          var el=document.getElementById("studio-qr-body");
          if(el) el.innerHTML='<div class="empty-msg">QR requires qrcode package</div>';
        });
    }

    /* AUTO-REFRESH */
    setInterval(function(){ fetchData().then(function(d){ STATE.data=d; renderAll() }).catch(function(){}) }, 30000);

    /* INIT */
    window.onload = function(){
      fetchData().then(function(d){ STATE.data=d; renderAll(); loadStudioQR() }).catch(function(e){ toast("Load failed: "+e.message,"error") });
    };
  `

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${data.appName} | Axil Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
${buildStyles()}
</head>
<body>

<nav class="sidebar">
  <div class="sb-header">
    <div class="sb-brand"><span>Axil Studio</span></div>
    <div class="sb-app">${data.appName}</div>
  </div>
  <div class="sb-nav">
    <button class="nav-link active" id="nav-overview" onclick="showPanel('overview')">${icon("overview")}<span>Overview</span></button>
    <button class="nav-link" id="nav-routes" onclick="showPanel('routes')">${icon("routes")}<span>Endpoints</span><span class="nav-badge" id="badge-routes">0</span></button>
    <button class="nav-link" id="nav-database" onclick="showPanel('database')">${icon("database")}<span>Database</span><span class="nav-badge" id="badge-tables">0</span></button>
    <button class="nav-link" id="nav-realtime" onclick="showPanel('realtime')">${icon("realtime")}<span>Realtime</span><span class="nav-badge" id="badge-rt">0</span></button>
    <button class="nav-link" id="nav-collections" onclick="showPanel('collections')">${icon("collections")}<span>Collections</span></button>
    <button class="nav-link" id="nav-qr" onclick="showPanel('qr')">${icon("qr")}<span>QR Access</span></button>
  </div>
  <div class="sb-footer">
    <div class="sb-status"><span class="sb-status-dot"></span>Connected</div>
    <a class="sb-link" href="${data.appUrl}" target="_blank" rel="noopener">${data.appUrl}</a>
  </div>
</nav>

<div class="main">
  <header class="topbar">
    <div class="tb-left">Axil Studio <span class="tb-sep">/</span> <strong id="topbar-label">Overview</strong></div>
    <a class="tb-url" href="${data.appUrl}" target="_blank" rel="noopener">${icon("link")}${data.appUrl}</a>
    <div class="tb-right">
      <button class="btn btn-sm btn-outline" id="refresh-btn" onclick="handleRefresh()">${icon("refresh")}Refresh</button>
      <button class="btn btn-sm btn-primary" onclick="showPanel('collections')">${icon("export")}Export</button>
    </div>
  </header>

  <div class="content">

    <!-- OVERVIEW -->
    <div class="tab-panel active" id="panel-overview">
      <h1 class="page-title">${data.appName}</h1>
      <p class="page-sub">Development API explorer &amp; database inspector</p>
      <div class="stats-grid" id="stats-grid"></div>
      <div class="ov-grid">
        <div class="card"><div class="card-hdr"><span class="card-title">Recent Endpoints</span><button class="btn btn-xs btn-ghost" onclick="showPanel('routes')">View all</button></div><div class="card-flush" id="ov-routes-list"><div class="loading-msg">Loading&hellip;</div></div></div>
        <div class="card"><div class="card-hdr"><span class="card-title">Database Objects</span><button class="btn btn-xs btn-ghost" onclick="showPanel('database')">View all</button></div><div class="card-flush" id="ov-db-list"><div class="loading-msg">Loading&hellip;</div></div></div>
      </div>
      <h3 class="section-hdr">Realtime</h3>
      <div id="ov-rt-list"><div class="loading-msg">Loading&hellip;</div></div>
    </div>

    <!-- ROUTES -->
    <div class="tab-panel" id="panel-routes">
      <h1 class="page-title">API Endpoints</h1>
      <p class="page-sub" id="routes-subtitle">Explore and test all HTTP endpoints</p>
      <div class="route-filter-bar">
        <input class="filter-input" placeholder="Search endpoints..." oninput="filterRoutes(this.value)" />
        <div class="mf-bar">
          <button class="mf-btn mf-active" data-m="ALL" onclick="setMethodFilter('ALL')">ALL</button>
          <button class="mf-btn" data-m="GET" onclick="setMethodFilter('GET')">GET</button>
          <button class="mf-btn" data-m="POST" onclick="setMethodFilter('POST')">POST</button>
          <button class="mf-btn" data-m="PUT" onclick="setMethodFilter('PUT')">PUT</button>
          <button class="mf-btn" data-m="PATCH" onclick="setMethodFilter('PATCH')">PATCH</button>
          <button class="mf-btn" data-m="DELETE" onclick="setMethodFilter('DELETE')">DELETE</button>
        </div>
      </div>
      <div id="routes-container"><div class="loading-msg">Loading&hellip;</div></div>
    </div>

    <!-- DATABASE -->
    <div class="tab-panel" id="panel-database">
      <h1 class="page-title">Database Inspector</h1>
      <div class="db-tabs">
        <button class="dbnav-btn dbnav-active" id="dbnav-tables" onclick="showDbSub('tables')">Tables</button>
        <button class="dbnav-btn" id="dbnav-query" onclick="showDbSub('query')">SQL Query</button>
      </div>
      <div id="dbsub-tables">
        <div class="db-layout">
          <div class="db-side">
            <div class="card">
              <div class="card-hdr"><span class="card-title">Tables</span><span class="card-meta" id="table-count"></span></div>
              <div style="padding:8px"><input class="filter-input" placeholder="Filter..." oninput="filterTables(this.value)" style="width:100%" /></div>
              <div class="card-flush" id="table-nav-list"><div class="loading-msg">Loading&hellip;</div></div>
            </div>
          </div>
          <div class="db-main" id="db-main-content"><div class="empty-msg">Select a table to inspect its schema and data</div></div>
        </div>
      </div>
      <div id="dbsub-query" style="display:none">
        <div class="card"><div class="card-hdr"><span class="card-title">SQL Query Editor</span><span class="card-meta">Read-only</span></div><div class="card-body">
          <textarea class="sql-input" id="sql-input" placeholder="SELECT * FROM users LIMIT 10;" spellcheck="false"></textarea>
          <div class="sql-actions">
            <button class="btn btn-sm btn-primary" onclick="runQuery()">${icon("play")}Run</button>
            <button class="btn btn-sm btn-outline" onclick="document.getElementById('sql-input').value=''">Clear</button>
            <span class="sql-time" id="query-time"></span>
          </div>
          <div id="query-result"><div class="empty-msg">Enter a query above</div></div>
        </div></div>
      </div>
    </div>

    <!-- REALTIME -->
    <div class="tab-panel" id="panel-realtime">
      <h1 class="page-title">Realtime Connections</h1>
      <p class="page-sub">Monitor WebSocket and SSE endpoints</p>
      <h3 class="section-hdr">WebSocket Endpoints</h3>
      <div id="ws-section"><div class="loading-msg">Loading&hellip;</div></div>
      <h3 class="section-hdr">Server-Sent Events</h3>
      <div id="sse-section"><div class="loading-msg">Loading&hellip;</div></div>
    </div>

    <!-- COLLECTIONS -->
    <div class="tab-panel" id="panel-collections">
      <h1 class="page-title">Export Collections</h1>
      <p class="page-sub">Download for Postman, Insomnia, or OpenAPI</p>
      <div class="export-grid">
        <div class="export-card"><div class="ec-icon">${icon("box")}</div><div class="ec-name">Postman</div><div class="ec-desc">v2.1 collection format</div><div class="ec-meta" id="postman-count">0 endpoints</div><button class="btn btn-sm btn-primary" onclick="downloadPostman()">Download</button></div>
        <div class="export-card"><div class="ec-icon">${icon("moon")}</div><div class="ec-name">Insomnia</div><div class="ec-desc">Export v4 format</div><div class="ec-meta" id="insomnia-count">0 endpoints</div><button class="btn btn-sm btn-primary" onclick="downloadInsomnia()">Download</button></div>
        <div class="export-card"><div class="ec-icon">${icon("file")}</div><div class="ec-name">OpenAPI 3.0</div><div class="ec-desc">Swagger-compatible spec</div><div class="ec-meta" id="openapi-count">0 endpoints</div><button class="btn btn-sm btn-outline" onclick="downloadOpenAPI()">Download</button></div>
      </div>
      <h3 class="section-hdr">Preview</h3>
      <div class="card"><div class="card-flush"><table class="preview-tbl"><thead><tr><th>Method</th><th>Path</th><th>Handler</th></tr></thead><tbody id="preview-tbody"><tr><td colspan="3"><div class="loading-msg">Loading&hellip;</div></td></tr></tbody></table></div></div>
    </div>

    <!-- QR -->
    <div class="tab-panel" id="panel-qr">
      <h1 class="page-title">QR Code Access</h1>
      <p class="page-sub">Scan to access from mobile</p>
      <div class="qr-grid">
        <div class="card"><div class="card-hdr"><span class="card-title">App URL</span></div><div class="qr-body"><img src="${data.qrDataUrl}" style="width:180px;border-radius:10px" onerror="this.style.display='none'" /><div class="qr-url">${data.appUrl}</div><button class="btn btn-xs btn-outline" onclick="copyUrl('${data.appUrl}')">Copy URL</button></div></div>
        <div class="card"><div class="card-hdr"><span class="card-title">Studio URL</span></div><div class="qr-body" id="studio-qr-body"><div class="loading-msg">Loading QR&hellip;</div></div></div>
      </div>
    </div>

  </div>
</div>
<div id="toast-container" class="toast-container"></div>
<script>${scriptContent}</script>
</body>
</html>`
}

/**
 * Minimal inline icon set (stroke-based, currentColor) — keeps the shell
 * dependency-free while giving the static chrome a consistent, professional
 * look. Purely presentational; none of these are referenced by the app logic.
 */
function icon(name: string): string {
  const common = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'
  const icons: Record<string, string> = {
    mark: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15 13 3 11 9 20 9 11 21 13 15Z"/></svg>`,
    overview: `<svg ${common}><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/></svg>`,
    routes: `<svg ${common}><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v3a4 4 0 0 0 4 4h4"/></svg>`,
    database: `<svg ${common}><ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.38 3.36 2.5 7.5 2.5s7.5-1.12 7.5-2.5v-13"/><path d="M4.5 12c0 1.38 3.36 2.5 7.5 2.5s7.5-1.12 7.5-2.5"/></svg>`,
    realtime: `<svg ${common}><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M8.3 8.3a5 5 0 0 0 0 7.4"/><path d="M15.7 8.3a5 5 0 0 1 0 7.4"/><path d="M5.3 5.3a9.5 9.5 0 0 0 0 13.4"/><path d="M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/></svg>`,
    collections: `<svg ${common}><path d="M3.5 8 12 3.5 20.5 8 12 12.5Z"/><path d="M3.5 8v8L12 20.5 20.5 16V8"/><path d="M12 12.5V20.5"/></svg>`,
    qr: `<svg ${common}><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20.5 14v2"/><path d="M14 20.5h3"/><path d="M20.5 20.5h.01"/></svg>`,
    link: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:5px;flex-shrink:0"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>`,
    refresh: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:4px"><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/></svg>`,
    export: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:4px"><path d="M12 4v11"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/></svg>`,
    play: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style="margin-right:4px"><path d="M6 4.5 19 12 6 19.5Z"/></svg>`,
    box: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8 12 3.5 20.5 8 12 12.5Z"/><path d="M3.5 8v8L12 20.5 20.5 16V8"/><path d="M12 12.5V20.5"/></svg>`,
    moon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>`,
    file: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3.5h7L18.5 8v12.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4.5"/><path d="M8.5 13h7"/><path d="M8.5 16.5h7"/></svg>`,
  }
  return icons[name] || ''
}

function buildStyles(): string {
  return `<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          sans: [
            'Inter',
            'ui-sans-serif',
            'system-ui',
            '-apple-system',
            'BlinkMacSystemFont',
            '"Segoe UI"',
            'sans-serif'
          ],
          mono: [
            '"JetBrains Mono"',
            '"SFMono-Regular"',
            'Consolas',
            'Menlo',
            'monospace'
          ]
        },
        colors: {
          studio: {
            25: '#fcfcfd',
            50: '#f8fafc',
            100: '#f1f5f9',
            150: '#edf1f5',
            200: '#e2e8f0',
            300: '#cbd5e1',
            400: '#94a3b8',
            500: '#64748b',
            600: '#475569',
            700: '#334155',
            800: '#1e293b',
            900: '#0f172a'
          },
          accent: {
            50: '#eef2ff',
            100: '#e0e7ff',
            200: '#c7d2fe',
            300: '#a5b4fc',
            400: '#818cf8',
            500: '#6366f1',
            600: '#4f46e5',
            700: '#4338ca',
            800: '#3730a3'
          }
        }
      }
    }
  }
</script>

<style type="text/tailwindcss">

  @layer base {

    * {
      box-sizing: border-box;
    }

    html {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      color-scheme: light;
    }

    html,
    body {
      width: 100%;
      height: 100%;
    }

    body {
      @apply font-sans text-[13px] leading-relaxed text-slate-700 bg-white flex h-screen overflow-hidden m-0 p-0;
    }

    a {
      @apply text-indigo-600 no-underline;
    }

    button,
    input,
    textarea,
    select {
      @apply font-sans;
    }

    button {
      @apply cursor-pointer;
    }

    button:focus-visible,
    a:focus-visible,
    input:focus-visible,
    textarea:focus-visible,
    select:focus-visible {
      outline: 2px solid #818cf8;
      outline-offset: 2px;
    }

    ::selection {
      @apply bg-indigo-100 text-indigo-900;
    }

    ::-webkit-scrollbar {
      width: 7px;
      height: 7px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      @apply bg-slate-200 rounded-full;
    }

    ::-webkit-scrollbar-thumb:hover {
      @apply bg-slate-300;
    }

    table {
      border-spacing: 0;
    }
  }


  @layer components {

    /* =========================================================
       SIDEBAR
       ========================================================= */

    .sidebar {
      @apply w-[248px] min-w-[248px] bg-white border-r border-slate-200 flex flex-col;
    }

    .sb-header {
      @apply px-5 pt-5 pb-4 border-b border-slate-100;
    }

    .sb-brand {
      @apply flex items-center gap-2.5 text-[15px] font-bold tracking-[-0.02em] text-slate-900;
    }

    .sb-mark {
      @apply inline-flex items-center justify-center text-indigo-600;
    }

    .sb-app {
      @apply mt-1.5 text-[11px] text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis font-mono;
    }

    .sb-nav {
      @apply flex-1 overflow-y-auto px-3 py-3;
    }

    .nav-link {
      @apply relative flex items-center gap-2.5 w-full bg-transparent px-3 py-2 rounded-md text-[12.5px] font-medium text-left text-slate-500 transition-all duration-100;
    }

    .nav-link:hover {
      @apply bg-slate-50 text-slate-800;
    }

    .nav-link svg {
      @apply flex-shrink-0 text-slate-400 transition-colors;
    }

    .nav-link:hover svg {
      @apply text-slate-600;
    }

    .nav-link.active {
      @apply bg-indigo-50 text-indigo-700 font-semibold;
    }

    .nav-link.active::before {
      content: '';
      @apply absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-indigo-600;
    }

    .nav-link.active svg {
      @apply text-indigo-600;
    }

    .nav-badge {
      @apply ml-auto min-w-[22px] text-center bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono;
    }

    .nav-link.active .nav-badge {
      @apply bg-indigo-100 text-indigo-700;
    }

    .sb-footer {
      @apply px-5 py-4 border-t border-slate-100 text-[11px];
    }

    .sb-status {
      @apply flex items-center gap-1.5 text-emerald-600 font-semibold mb-1.5;
    }

    .sb-status-dot {
      @apply w-1.5 h-1.5 rounded-full bg-emerald-500;
      box-shadow: 0 0 0 3px #ecfdf5;
    }

    .sb-link {
      @apply text-slate-400 block whitespace-nowrap overflow-hidden text-ellipsis font-mono;
    }

    .sb-link:hover {
      @apply text-indigo-600;
    }


    /* =========================================================
       MAIN / TOPBAR
       ========================================================= */

    .main {
      @apply flex-1 flex flex-col overflow-hidden min-w-0 bg-slate-50;
    }

    .topbar {
      @apply h-[60px] bg-white border-b border-slate-200 flex items-center px-6 gap-3 flex-shrink-0;
    }

    .tb-left {
      @apply text-[12px] text-slate-400 whitespace-nowrap;
    }

    .tb-left strong {
      @apply text-slate-800 font-semibold;
    }

    .tb-sep {
      @apply text-slate-300 mx-1;
    }

    .tb-url {
      @apply inline-flex items-center max-w-[420px] font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-md overflow-hidden text-ellipsis whitespace-nowrap transition-colors;
    }

    .tb-url:hover {
      @apply bg-indigo-50 border-indigo-200 text-indigo-700;
    }

    .tb-right {
      @apply ml-auto flex items-center gap-1.5 flex-shrink-0;
    }

    .content {
      @apply flex-1 overflow-y-auto px-7 pt-7 pb-16 bg-slate-50;
    }

    .tab-panel {
      display: none;
    }

    .tab-panel.active {
      @apply block;
    }

    .page-title {
      @apply text-[22px] font-bold tracking-[-0.025em] mb-1 text-slate-900;
    }

    .page-sub {
      @apply text-[13px] text-slate-500 mb-7;
    }

    .section-hdr {
      @apply text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mt-8 mb-2.5;
    }


    /* =========================================================
       BUTTONS
       ========================================================= */

    .btn {
      @apply inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-md whitespace-nowrap border transition-all duration-100;
    }

    .btn-primary {
      @apply bg-indigo-600 border-indigo-600 text-white shadow-sm;
    }

    .btn-primary:hover {
      @apply bg-indigo-700 border-indigo-700;
    }

    .btn-outline {
      @apply bg-white border-slate-200 text-slate-600;
    }

    .btn-outline:hover {
      @apply border-slate-300 bg-slate-50 text-slate-800;
    }

    .btn-ghost {
      @apply bg-transparent border-transparent text-slate-500;
    }

    .btn-ghost:hover {
      @apply bg-slate-100 text-slate-800;
    }

    .btn-green {
      @apply bg-emerald-50 border-emerald-100 text-emerald-700;
    }

    .btn-green:hover {
      @apply bg-emerald-100 border-emerald-200;
    }

    .btn-sm {
      @apply px-2.5 py-1.5 text-[11.5px];
    }

    .btn-xs {
      @apply px-2 py-1 text-[10.5px] rounded-md;
    }

    .btn:disabled {
      @apply opacity-40 pointer-events-none;
    }


    /* =========================================================
       CARDS
       ========================================================= */

    .card {
      @apply bg-white border border-slate-200 rounded-lg mb-4 overflow-hidden shadow-none;
    }

    .card-hdr {
      @apply flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-white text-[13px];
    }

    .card-title {
      @apply font-semibold text-slate-800 tracking-[-0.01em];
    }

    .card-meta {
      @apply ml-auto text-[11px] text-slate-400 font-mono;
    }

    .card-body {
      @apply p-4;
    }

    .card-flush {
      @apply p-0;
    }


    /* =========================================================
       STAT CARDS
       ========================================================= */

    .stats-grid {
      @apply grid gap-3 mb-6;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    }

    .stat-card {
      @apply bg-white border border-slate-200 rounded-lg px-4 py-4;
    }

    .stat-card:hover {
      @apply border-slate-300;
    }

    .stat-value {
      @apply text-[25px] font-bold leading-none mb-2 tracking-[-0.02em] font-mono;
    }

    .stat-value.blue {
      @apply text-indigo-600;
    }

    .stat-value.green {
      @apply text-emerald-600;
    }

    .stat-value.purple {
      @apply text-violet-600;
    }

    .stat-value.orange {
      @apply text-amber-600;
    }

    .stat-value.red {
      @apply text-rose-600;
    }

    .stat-label {
      @apply text-[10px] text-slate-400 font-semibold uppercase tracking-[0.08em];
    }


    /* =========================================================
       OVERVIEW
       ========================================================= */

    .ov-grid {
      @apply grid grid-cols-2 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden;
    }

    .ov-item {
      @apply flex items-center gap-2.5 px-4 py-2.5 bg-white cursor-pointer transition-colors;
    }

    .ov-item:hover {
      @apply bg-slate-50;
    }

    .ov-dot {
      @apply w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0;
    }

    .ov-path {
      @apply font-mono text-[12px] flex-1 text-slate-700 overflow-hidden text-ellipsis whitespace-nowrap;
    }

    .ov-handler {
      @apply text-[10.5px] text-slate-400 font-mono max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap;
    }

    .rt-badge {
      @apply font-mono text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide border;
    }

    .rt-ws {
      @apply bg-emerald-50 text-emerald-700 border-emerald-100;
    }

    .rt-sse {
      @apply bg-indigo-50 text-indigo-700 border-indigo-100;
    }


    /* =========================================================
       HTTP METHOD PILLS
       ========================================================= */

    .method-pill {
      @apply font-mono text-[10px] font-bold px-2 py-1 rounded-md text-center inline-block tracking-wide border;
      min-width: 52px;
    }

    .method-GET {
      @apply bg-emerald-50 text-emerald-700 border-emerald-100;
    }

    .method-POST {
      @apply bg-indigo-50 text-indigo-700 border-indigo-100;
    }

    .method-PUT {
      @apply bg-amber-50 text-amber-700 border-amber-100;
    }

    .method-PATCH {
      @apply bg-violet-50 text-violet-700 border-violet-100;
    }

    .method-DELETE {
      @apply bg-rose-50 text-rose-700 border-rose-100;
    }

    .method-HEAD {
      @apply bg-cyan-50 text-cyan-700 border-cyan-100;
    }

    .method-OPTIONS {
      @apply bg-slate-100 text-slate-600 border-slate-200;
    }


    /* =========================================================
       ROUTES
       ========================================================= */

    .route-filter-bar {
      @apply flex gap-2 mb-4 flex-wrap;
    }

    .filter-input {
      @apply flex-1 min-w-[220px] bg-white border border-slate-200 rounded-md px-3 py-2.5 text-[12.5px] outline-none text-slate-800 transition-all;
    }

    .filter-input::placeholder {
      @apply text-slate-400;
    }

    .filter-input:hover {
      @apply border-slate-300;
    }

    .filter-input:focus {
      @apply border-indigo-400;
      box-shadow: 0 0 0 3px #eef2ff;
      outline: none;
    }

    .mf-bar {
      @apply flex gap-0.5 bg-white border border-slate-200 p-1 rounded-md;
    }

    .mf-btn {
      @apply font-mono text-[10px] font-bold px-2.5 py-1.5 rounded transition-colors text-slate-400;
    }

    .mf-btn:hover {
      @apply text-slate-700 bg-slate-50;
    }

    .mf-btn.mf-active {
      @apply text-indigo-700 bg-indigo-50;
    }

    .route-group {
      @apply bg-white border border-slate-200 rounded-lg overflow-hidden mb-3;
    }

    .rg-header {
      @apply flex items-center gap-2.5 px-4 py-3 bg-slate-50 border-b border-slate-100 cursor-pointer select-none transition-colors;
    }

    .rg-header:hover {
      @apply bg-slate-100;
    }

    .rg-dot {
      @apply w-1.5 h-1.5 rounded-full bg-indigo-500;
    }

    .rg-name {
      @apply font-mono text-[13px] font-semibold text-slate-800;
    }

    .rg-count {
      @apply text-[10px] text-slate-500 font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded;
    }

    .rg-chevron {
      @apply ml-auto text-slate-400 text-[10px] transition-transform duration-150;
    }

    .rg-chevron.open {
      transform: rotate(90deg);
    }

    .rg-body {
      display: none;
    }

    .rg-body.open {
      display: block;
    }

    .route-item {
      @apply border-b border-slate-100;
    }

    .route-item:last-child {
      @apply border-b-0;
    }

    .ri-header {
      @apply flex items-center gap-2.5 px-4 py-3 cursor-pointer transition-colors flex-wrap;
    }

    .ri-header:hover {
      @apply bg-slate-50;
    }

    .route-item.expanded .ri-header {
      @apply bg-indigo-50/40;
    }

    .ri-path {
      @apply font-mono text-[12.5px] font-semibold flex-1 text-slate-800;
    }

    .path-param {
      @apply text-amber-600 italic font-bold;
    }

    .ri-tags {
      @apply flex gap-1 flex-wrap;
    }

    .mw-tag {
      @apply text-[9px] font-bold px-1.5 py-0.5 rounded border;
    }

    .mw-auth {
      @apply text-violet-700 bg-violet-50 border-violet-100;
    }

    .mw-validate {
      @apply text-indigo-700 bg-indigo-50 border-indigo-100;
    }

    .mw-rate {
      @apply text-amber-700 bg-amber-50 border-amber-100;
    }

    .mw-cors {
      @apply text-cyan-700 bg-cyan-50 border-cyan-100;
    }

    .mw-default {
      @apply text-slate-500 bg-slate-100 border-slate-200;
    }

    .ri-handler {
      @apply text-[10.5px] text-slate-400 font-mono;
    }

    .ri-body {
      display: none;
      @apply bg-slate-50 border-t border-slate-100;
    }

    .route-item.expanded .ri-body {
      display: block;
    }

    .ri-meta-bar {
      @apply flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-100 flex-wrap text-[11.5px];
    }

    .ri-meta-label {
      @apply text-slate-400 font-medium;
    }

    .ri-meta-code {
      @apply font-mono text-[11.5px] text-slate-800;
    }

    .ri-detail-grid {
      @apply grid grid-cols-2;
    }

    .detail-section {
      @apply p-4 border-b border-slate-100;
    }

    .detail-section:nth-child(odd) {
      @apply border-r border-slate-100;
    }

    .detail-label {
      @apply text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-2.5;
    }

    .param-row {
      @apply flex gap-3 py-1.5 items-center text-[12px] border-b border-slate-100;
    }

    .param-row:last-child {
      @apply border-b-0;
    }

    .param-name {
      @apply font-mono font-bold text-slate-800;
      width: 105px;
    }

    .param-type {
      @apply font-mono text-indigo-600 text-[11px];
    }

    .param-req {
      @apply text-rose-600 text-[9px] font-bold ml-auto uppercase tracking-wide;
    }

    .param-empty {
      @apply text-slate-400 text-[12px];
    }

    .code-block {
      @apply bg-white border border-slate-200 rounded-md p-3 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all m-0 text-slate-700;
      line-height: 1.7;
    }

    .res-code-row {
      @apply flex items-center gap-2.5 py-1.5 text-[12px] text-slate-600 border-b border-slate-100;
    }

    .res-code-row:last-child {
      @apply border-b-0;
    }

    .res-code {
      @apply font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border;
    }

    .res-ok {
      @apply bg-emerald-50 text-emerald-700 border-emerald-100;
    }

    .res-warn {
      @apply bg-amber-50 text-amber-700 border-amber-100;
    }

    .res-err {
      @apply bg-rose-50 text-rose-700 border-rose-100;
    }

    .ri-try-bar {
      @apply px-4 py-2.5 border-t border-slate-100;
    }

    .ri-try-panel {
      @apply p-4 bg-white border-t border-slate-100;
    }

    .try-form {
      @apply flex flex-col gap-2;
    }

    .try-label {
      @apply text-[9.5px] font-bold uppercase text-slate-400 tracking-wide;
    }

    .try-input {
      @apply w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-2 font-mono text-[11.5px] outline-none text-slate-800 transition-all;
    }

    .try-input:focus {
      @apply border-indigo-400;
      box-shadow: 0 0 0 3px #eef2ff;
    }

    .try-textarea {
      @apply resize-y;
      min-height: 84px;
    }

    .try-result {
      @apply mt-2.5;
    }

    .try-res-header {
      @apply flex items-center gap-2.5 mb-1.5 text-[12px];
    }

    .res-status {
      @apply font-mono text-[10px] font-bold px-2 py-1 rounded-md border;
    }

    .res-time {
      @apply text-slate-400 text-[10.5px] font-mono;
    }

    .try-loading {
      @apply text-slate-400 text-[12px];
    }


    /* =========================================================
       DATABASE
       ========================================================= */

    .db-tabs {
      @apply flex items-center gap-1 mb-4 border-b border-slate-200;
    }

    .dbnav-btn {
      @apply relative bg-transparent px-3.5 py-2.5 text-[12px] font-semibold text-slate-400 rounded-t-md transition-colors;
    }

    .dbnav-btn:hover {
      @apply text-slate-700 bg-slate-50;
    }

    .dbnav-btn.dbnav-active {
      @apply text-indigo-700 bg-white;
    }

    .dbnav-btn.dbnav-active::after {
      content: '';
      @apply absolute left-2 right-2 bottom-[-1px] h-0.5 bg-indigo-600 rounded-t-full;
    }

    .db-layout {
      @apply flex gap-4 items-start;
    }

    .db-side {
      @apply flex-shrink-0 bg-white border border-slate-200 rounded-lg overflow-hidden;
      width: 240px;
      min-width: 240px;
    }

    .db-main {
      @apply flex-1 min-w-0;
    }

    .tn-item {
      @apply flex items-center gap-1.5 px-3 py-2 cursor-pointer font-mono text-[11.5px] text-slate-600 rounded-md transition-colors;
      margin: 2px 6px;
    }

    .tn-item:hover {
      @apply bg-slate-50 text-slate-800;
    }

    .tn-item.tn-selected {
      @apply bg-indigo-50 text-indigo-700 font-bold;
    }

    .tn-name {
      @apply flex-1 overflow-hidden text-ellipsis whitespace-nowrap;
    }

    .tn-count {
      @apply text-[9.5px] text-slate-400 font-sans bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded;
    }

    .tn-item.tn-selected .tn-count {
      @apply text-indigo-700 bg-indigo-100 border-indigo-200;
    }


    /* Database schema table */

    .schema-tbl {
      @apply w-full border-collapse text-[12px];
    }

    .schema-tbl th {
      @apply bg-slate-50 border-b border-slate-200 px-3 py-2.5 text-left text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400;
    }

    .schema-tbl td {
      @apply px-3 py-2.5 border-b border-slate-100 align-middle;
    }

    .schema-tbl tr:last-child td {
      @apply border-b-0;
    }

    .schema-tbl tr:hover td {
      @apply bg-slate-50;
    }

    .col-name {
      @apply font-mono font-semibold text-slate-800;
    }

    .col-type {
      @apply font-mono text-indigo-600 text-[10.5px];
    }

    .col-default {
      @apply font-mono text-[10.5px] text-slate-400;
    }

    .flag {
      @apply text-[8.5px] font-bold px-1.5 py-0.5 rounded tracking-wide border;
    }

    .flag-pk {
      @apply text-amber-700 bg-amber-50 border-amber-100;
    }

    .flag-uq {
      @apply text-indigo-700 bg-indigo-50 border-indigo-100;
    }

    .flag-nn {
      @apply text-rose-700 bg-rose-50 border-rose-100;
    }

    .flag-null {
      @apply text-slate-400 bg-slate-100 border-slate-200;
    }


    /* Database data grid */

    .row-num {
      @apply text-slate-300 text-[9px] text-right font-mono;
      padding-right: 8px;
      min-width: 34px;
    }

    .dt-wrap {
      @apply overflow-x-auto;
    }

    .data-tbl {
      @apply w-full border-collapse text-[11.5px];
    }

    .data-tbl th {
      @apply bg-slate-50 border-b border-slate-200 px-3 py-2.5 text-left font-mono text-[9.5px] font-bold text-slate-500 whitespace-nowrap;
    }

    .data-tbl td {
      @apply px-3 py-2 border-b border-slate-100 font-mono text-[11px] overflow-hidden text-ellipsis whitespace-nowrap text-slate-700;
      max-width: 260px;
    }

    .data-tbl tr:last-child td {
      @apply border-b-0;
    }

    .data-tbl tr:hover td {
      @apply bg-indigo-50/30;
    }

    .cell-null {
      @apply text-slate-300 italic;
    }

    .cell-true {
      @apply text-emerald-600 font-semibold;
    }

    .cell-false {
      @apply text-rose-600 font-semibold;
    }

    .cell-num {
      @apply text-indigo-600;
    }


    /* Pagination */

    .pag {
      @apply flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100;
    }

    .pag-info {
      @apply text-[10.5px] text-slate-400 font-mono;
    }

    .pag-btns {
      @apply flex gap-1.5 items-center;
    }

    .pag-btn {
      @apply bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-[11px] transition-colors text-slate-600;
    }

    .pag-btn:hover:not(:disabled) {
      @apply text-indigo-700 bg-indigo-50 border-indigo-200;
    }

    .pag-btn:disabled {
      @apply opacity-35 cursor-not-allowed;
    }

    .pag-cur {
      @apply text-[11px] text-slate-600 font-semibold;
    }


    /* SQL editor */

    .sql-input {
      @apply w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-lg p-3 font-mono text-[12px] resize-y outline-none mb-2.5;
      min-height: 120px;
      line-height: 1.7;
    }

    .sql-input::placeholder {
      @apply text-slate-500;
    }

    .sql-input:focus {
      @apply border-indigo-500;
      box-shadow: 0 0 0 3px #eef2ff;
    }

    .sql-actions {
      @apply flex gap-2 items-center mb-3.5;
    }

    .sql-time {
      @apply ml-auto text-[10.5px] text-slate-400 font-mono;
    }

    .query-err {
      @apply bg-rose-50 border border-rose-100 rounded-lg p-3 font-mono text-[11.5px] text-rose-700;
    }


    /* =========================================================
       REALTIME
       ========================================================= */

    .rt-card {
      @apply bg-white border border-slate-200 rounded-lg overflow-hidden mb-3.5;
    }

    .rt-header {
      @apply flex items-center gap-2.5 px-4 py-3 bg-white border-b border-slate-100;
    }

    .rt-path {
      @apply font-mono text-[12.5px] font-semibold text-slate-800;
    }

    .rt-status {
      @apply ml-auto text-[10.5px] text-slate-400;
    }

    .rt-body {
      @apply px-4 py-3.5;
    }

    .rt-label {
      @apply text-[9.5px] font-bold uppercase text-slate-400 mb-1.5 tracking-[0.08em];
      margin-top: 12px;
    }

    .rt-label:first-child {
      margin-top: 0;
    }

    .rt-events {
      @apply flex gap-1.5 flex-wrap;
    }

    .ev-chip {
      @apply font-mono text-[9.5px] font-semibold px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-600;
    }

    .empty-inline {
      @apply text-slate-400 text-[11px];
    }

    .rt-url {
      @apply font-mono text-[11.5px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2.5 py-2;
    }

    .rt-log {
      @apply bg-slate-950 border border-slate-800 rounded-lg overflow-y-auto font-mono text-[10.5px] p-2 text-slate-300;
      height: 180px;
    }

    .log-line {
      @apply py-1 border-b border-slate-800;
      line-height: 1.6;
    }

    .log-line:last-child {
      @apply border-b-0;
    }

    .log-time {
      @apply text-slate-500 text-[9.5px];
      margin-right: 7px;
    }

    .log-in {
      @apply text-emerald-400 font-bold;
    }

    .log-out {
      @apply text-indigo-400 font-bold;
    }

    .log-sys {
      @apply text-slate-500 font-bold;
    }

    .rt-controls {
      @apply flex gap-1.5 flex-wrap;
      margin-top: 10px;
    }

    .rt-input {
      @apply flex-1 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 font-mono text-[10.5px] outline-none;
      min-width: 140px;
    }

    .rt-input:focus {
      @apply border-indigo-400;
      box-shadow: 0 0 0 3px #eef2ff;
    }


    /* =========================================================
       COLLECTIONS / EXPORT
       ========================================================= */

    .export-grid {
      @apply grid gap-3.5 mb-6;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    }

    .export-card {
      @apply bg-white border border-slate-200 rounded-lg p-5 flex flex-col transition-colors;
    }

    .export-card:hover {
      @apply border-slate-300 bg-slate-50;
    }

    .ec-icon {
      @apply text-indigo-600 mb-3;
    }

    .ec-name {
      @apply text-[14px] font-semibold mb-1 tracking-tight text-slate-800;
    }

    .ec-desc {
      @apply text-[12px] text-slate-500 mb-4 flex-1 leading-relaxed;
    }

    .ec-meta {
      @apply text-[10.5px] text-slate-400 mb-3.5 font-mono;
    }

    .preview-tbl {
      @apply w-full border-collapse text-[12px];
    }

    .preview-tbl th {
      @apply px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-200;
    }

    .preview-tbl td {
      @apply px-3 py-2.5 border-b border-slate-100;
    }

    .preview-tbl tr:last-child td {
      @apply border-b-0;
    }

    .preview-tbl tr:hover td {
      @apply bg-slate-50;
    }

    .mono {
      @apply font-mono;
    }

    .muted {
      @apply text-slate-400;
    }


    /* =========================================================
       QR
       ========================================================= */

    .qr-grid {
      @apply grid grid-cols-2 gap-4;
    }

    .qr-body {
      @apply flex flex-col items-center py-8 px-6 gap-3;
    }

    .qr-url {
      @apply font-mono text-[11.5px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-3 py-2 text-center break-all;
    }


    /* =========================================================
       EMPTY / LOADING
       ========================================================= */

    .empty-msg {
      @apply text-center text-slate-400 text-[12.5px];
      padding: 42px 20px;
    }

    .loading-msg {
      @apply text-center text-slate-400 text-[12.5px] py-8;
    }


    /* =========================================================
       TOASTS
       ========================================================= */

    .toast-container {
      @apply fixed z-50 flex flex-col gap-2;
      bottom: 20px;
      right: 20px;
      pointer-events: none;
    }

    .toast {
      @apply bg-slate-900 text-white border border-slate-700 px-4 py-2.5 rounded-lg text-[12px] opacity-0 shadow-xl;
      transform: translateY(8px);
      transition:
        opacity .18s ease,
        transform .18s ease;
      pointer-events: auto;
      min-width: 220px;
    }

    .toast.show {
      @apply opacity-100;
      transform: none;
    }

    .toast-success {
      @apply bg-emerald-600 border-emerald-500;
    }

    .toast-error {
      @apply bg-rose-600 border-rose-500;
    }

    .toast-warn {
      @apply bg-amber-600 border-amber-500;
    }

    .toast-info {
      @apply bg-indigo-600 border-indigo-500;
    }


    /* =========================================================
       DATABASE OBJECT GROUPS
       ========================================================= */

    .db-object-group {
      @apply px-3 pt-3 pb-1;
    }

    .db-object-title {
      @apply px-2 pb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400;
    }

    .db-object-item {
      @apply flex items-center gap-2 px-2.5 py-2 rounded-md text-[11px] text-slate-600 font-mono cursor-pointer transition-colors;
    }

    .db-object-item:hover {
      @apply bg-slate-50 text-slate-800;
    }

    .db-object-item.active {
      @apply bg-indigo-50 text-indigo-700 font-semibold;
    }

    .db-object-count {
      @apply ml-auto text-[9px] text-slate-400 font-sans;
    }


    /* =========================================================
       STATUS INDICATORS
       ========================================================= */

    .status-online {
      @apply inline-flex items-center gap-1.5 text-emerald-600;
    }

    .status-online::before {
      content: '';
      @apply w-1.5 h-1.5 rounded-full bg-emerald-500;
    }

    .status-offline {
      @apply inline-flex items-center gap-1.5 text-rose-600;
    }

    .status-offline::before {
      content: '';
      @apply w-1.5 h-1.5 rounded-full bg-rose-500;
    }

    .status-warning {
      @apply inline-flex items-center gap-1.5 text-amber-600;
    }

    .status-warning::before {
      content: '';
      @apply w-1.5 h-1.5 rounded-full bg-amber-500;
    }


    /* =========================================================
       SMALL DATA LABELS
       ========================================================= */

    .data-label {
      @apply text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400;
    }

    .data-value {
      @apply font-mono text-[11.5px] text-slate-700;
    }

    .schema-type {
      @apply inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono text-[9px] font-semibold;
    }

    .schema-key {
      @apply inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 font-mono text-[9px] font-semibold;
    }

  }


  @layer utilities {

    @media(max-width:1200px) {
      .content {
        @apply px-5;
      }

      .ri-detail-grid {
        grid-template-columns: 1fr;
      }

      .detail-section:nth-child(odd) {
        @apply border-r-0;
      }
    }

    @media(max-width:1000px) {
      .sidebar {
        width: 220px;
        min-width: 220px;
      }

      .ov-grid {
        grid-template-columns: 1fr;
      }

      .db-layout {
        flex-direction: column;
      }

      .db-side {
        width: 100%;
        min-width: unset;
      }
    }

    @media(max-width:800px) {
      .sidebar {
        width: 64px;
        min-width: 64px;
      }

      .sb-header {
        @apply px-3;
      }

      .sb-brand {
        justify-content: center;
      }

      .sb-brand > span:not(.sb-mark) {
        display: none;
      }

      .sb-app,
      .sb-footer {
        display: none;
      }

      .sb-nav {
        @apply px-2;
      }

      .nav-link {
        justify-content: center;
        padding-left: 8px;
        padding-right: 8px;
      }

      .nav-link span:not(.nav-badge) {
        display: none;
      }

      .nav-badge {
        display: none;
      }

      .content {
        @apply px-4 pt-5;
      }

      .topbar {
        @apply px-4;
      }

      .tb-left,
      .tb-url {
        display: none;
      }

      .qr-grid {
        grid-template-columns: 1fr;
      }
    }

    @media(max-width:600px) {
      .stats-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .stat-value {
        font-size: 21px;
      }

      .page-title {
        font-size: 19px;
      }

      .ri-handler {
        display: none;
      }

      .route-filter-bar {
        flex-direction: column;
      }

      .mf-bar {
        width: 100%;
        overflow-x: auto;
      }

      .db-tabs {
        overflow-x: auto;
      }

      .dbnav-btn {
        white-space: nowrap;
      }
    }

    @media(prefers-reduced-motion:reduce) {
      *,
      *::before,
      *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .01ms !important;
        scroll-behavior: auto !important;
      }
    }
  }

</style>`;
}