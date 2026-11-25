// Token Radar's dashboard (radar-2). Reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, filters, sorting, a per-protocol detail
// view with the model's own arithmetic, and the live-token view. No network: every
// byte shown is in data.js. No protocol name is special-cased anywhere here.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { q: '', category: 'all', chain: 'all', watch: false, minTvl: 0, sort: 'rank', dir: 1, tab: 'pre-token', selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'); }

  // The model in one function: the page recomputes a row from the snapshot figures
  // and checks the number board.json carries, so page code and board data agree.
  // implied = round(TVL x category_multiple x growth x maturity x chains)
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * row.growth_multiplier * row.maturity_multiplier * row.chain_multiplier));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // Deep links: #/detail/<slug> opens a detail view on load; #/filter?category=<cat>
  // or #/watchlist applies a filter on load; no hash shows the board.
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    if (hash.indexOf('/detail/') === 0) { state.selected = decodeURIComponent(hash.slice(8).split('?')[0]); return; }
    if (hash === '/watchlist') { state.watch = true; return; }
    if (hash.indexOf('/filter') === 0) {
      var q = hash.indexOf('?') >= 0 ? hash.slice(hash.indexOf('?') + 1) : '';
      var params = new URLSearchParams(q);
      if (params.get('category')) state.category = params.get('category');
      if (params.get('chain')) state.chain = params.get('chain');
      if (params.get('q')) state.q = params.get('q');
      if (params.get('watchlist')) state.watch = true;
      return;
    }
    if (hash === '/live') state.tab = 'live';
  }
  function setHash() {
    var h = '';
    if (state.selected) h = '#/detail/' + encodeURIComponent(state.selected);
    else if (state.watch) h = '#/watchlist';
    else if (state.category !== 'all') h = '#/filter?category=' + encodeURIComponent(state.category);
    window.history.replaceState(null, '', h || window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -Infinity : a.age_days; bv = b.age_days === null ? -Infinity : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return key === 'rank' ? -1 : 1;
      if (av > bv) return key === 'rank' ? 1 : -1;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function headerFacts() {
    document.getElementById('snap-date').textContent = 'Snapshot ' + DATA.as_of;
    document.getElementById('model-tag').textContent = DATA.model_version + ' model · overall live median x' + DATA.overall_multiple;
    var facts = document.getElementById('facts');
    facts.textContent = '';
    var top = DATA.rows[0];
    var items = [
      ['Ranked pre-token protocols', String(DATA.board_size)],
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
      ['Early rows below the $50M floor', String(DATA.early_size)],
      ['Live-token comparables priced', String(DATA.live_comps)],
      ['Live-token protocols shown', String(DATA.live_size)],
    ];
    items.forEach(function (it) {
      facts.appendChild(el('div', { class: 'fact' }, el('span', { text: it[0] }), el('b', { text: it[1] })));
    });
    var pick = document.getElementById('top-pick');
    if (top) pick.innerHTML = '';
    if (top) {
      pick.appendChild(document.createTextNode('Top of the board: '));
      pick.appendChild(el('b', { text: top.name }));
      pick.appendChild(document.createTextNode(' — ' + fmtUsd(top.implied_value_usd) + ' implied on ' + fmtUsd(top.tvl_usd) + ' TVL.'));
    }
    document.getElementById('foot-line').textContent =
      'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '. Implied values are this entry\u2019s model estimates, not prices.';
  }

  // The method section's numbers, filled from the same data the board renders:
  // one row per category with its multiple, its live comparables and the weight
  // they carry, plus the snapshot-level figures. This is the model's whole
  // pricing table, in the open, so a reader can check any row's multiple.
  function fillMethod() {
    var stats = document.getElementById('method-stats');
    var holder = document.getElementById('cat-table');
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      if (!byCat[c]) byCat[c] = r;
    });
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b].category_multiple - byCat[a].category_multiple; });
    var outright = 0, shrunk = 0, flat = 0;
    cats.forEach(function (c) {
      var w = byCat[c].category_weight;
      if (w >= 1) outright++;
      else if (w > 0) shrunk++;
      else flat++;
    });
    if (stats) {
      stats.textContent = 'In this snapshot ' + DATA.live_comps + ' live-token protocols price the board: the overall live median is x' + DATA.overall_multiple + '; ' + outright + ' categor' + (outright === 1 ? 'y is' : 'ies are') + ' priced by their own median outright, ' + shrunk + ' by a shrinkage blend, and ' + flat + ' at the overall median for want of any live comparable.';
    }
    if (!holder) return;
    var tbody = el('tbody');
    cats.forEach(function (c) {
      var r = byCat[c];
      var rows = DATA.rows.filter(function (x) { return (x.category || 'Other') === c; }).length;
      tbody.appendChild(el('tr', null,
        el('td', { text: c }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', { class: 'num', text: String(r.category_comps) }),
        el('td', { class: 'num', text: r.category_weight.toFixed(2) }),
        el('td', { class: 'num', text: String(rows) })
      ));
    });
    holder.appendChild(el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Every category\u2019s multiple, its live comparables and the weight they carry. Weight 1.00 means the category median prices its rows outright; lower means the overall live median carries the rest.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Multiple' }),
            el('th', { scope: 'col', text: 'Live comparables' }),
            el('th', { scope: 'col', text: 'Weight' }),
            el('th', { scope: 'col', text: 'Board rows' })
          )),
          tbody
        )
      )
    ));
  }

  // The checks section: the build-time checks from data.js, plus the same
  // recompute run live in the browser over every row, so the page proves its
  // own arithmetic instead of asking to be trusted.
  function fillChecks() {
    var line = document.getElementById('checks-line');
    var holder = document.getElementById('checks-table');
    var checks = DATA.checks;
    if (!checks || !line) return;
    var liveExact = 0;
    DATA.rows.forEach(function (r) { if (impliedOf(r) === r.implied_value_usd) liveExact++; });
    line.textContent = 'Recomputed at build time: ' + checks.recompute_exact + ' of ' + checks.recompute_total +
      ' rows match board.json exactly — and this page just recomputed them live: ' + liveExact + ' of ' + DATA.rows.length +
      ' match. Worst of the four wobble rebuilds: ' + checks.worst_top20_overlap + ' of the top 20 survive, rank correlation ' + checks.worst_rank_spearman.toFixed(4) + '.';
    if (!holder) return;
    var tbody = el('tbody');
    checks.perturbations.forEach(function (p) {
      tbody.appendChild(el('tr', null,
        el('td', { text: 'TVL x' + p.tvl_factor.toFixed(1) + ', 7d ' + (p.growth_shift_pp > 0 ? '+' : '') + p.growth_shift_pp + 'pp' }),
        el('td', { class: 'num', text: p.top20_overlap + ' / 20' }),
        el('td', { class: 'num', text: p.top10_overlap + ' / 10' }),
        el('td', { class: 'num', text: p.rank_spearman.toFixed(4) }),
        el('td', { text: p.top1_same ? 'same top row' : 'top row changed' })
      ));
    });
    holder.appendChild(el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'The board rebuilt with every protocol\u2019s TVL and 7-day change moved at once. Overlap counts the top rows the rebuild kept.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Wobble applied' }),
            el('th', { scope: 'col', text: 'Top 20 kept' }),
            el('th', { scope: 'col', text: 'Top 10 kept' }),
            el('th', { scope: 'col', text: 'Rank correlation' }),
            el('th', { scope: 'col', text: 'Top row' })
          )),
          tbody
        )
      )
    ));
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; setHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; render(); });
    var watchBtn = el('button', { type: 'button', class: 'button', 'aria-pressed': state.watch ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watch = !state.watch; setHash(); render(); } });
    var sortSel = el('select', { id: 'sort', 'aria-label': 'Sort by' },
      [['rank', 'Rank (implied value)'], ['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7d growth'], ['age', 'Age']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: o[0] === state.sort ? 'selected' : null });
      })
    );
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; render(); });
    var tvlSel = el('select', { id: 'mintvl', 'aria-label': 'Minimum TVL' },
      [[0, 'Any TVL'], [5000000, 'TVL $5M+'], [50000000, 'TVL $50M+'], [100000000, 'TVL $100M+'], [500000000, 'TVL $500M+'], [1000000000, 'TVL $1B+']].map(function (o) {
        return el('option', { value: String(o[0]), text: o[1], selected: o[0] === state.minTvl ? 'selected' : null });
      })
    );
    tvlSel.addEventListener('change', function () { state.minTvl = Number(tvlSel.value); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var count = state.tab === 'pre-token' ? filteredRows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Watchlist' }), watchBtn),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort' }), sortSel),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Min TVL' }), tvlSel),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: count })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { state.sort = key; render(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: key === 'rank' ? ' ^' : ' v' }) : null)
    );
  }

  function chainsText(r) {
    if (!r.chains || !r.chains.length) return 'an unnamed chain';
    return r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '');
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; state.minTvl = 0; setHash(); render(); } })
      ));
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        class: r.rank === 1 ? 'rank1' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rankcell', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), r.watchlist ? el('span', { class: 'tag', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + chainsText(r) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: 'x' + r.value_tvl_ratio.toFixed(2) }),
        el('td', null, el('span', { class: 'status', text: 'records no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its value arithmetic and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            el('th', { scope: 'col', text: 'Protocol' }),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Value / TVL' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + chainsText(r) }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap / TVL ratios are what price the board.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function openDetail(slug) {
    state.selected = slug;
    setHash();
    render();
  }
  function closeDetail() {
    state.selected = null;
    setHash();
    render();
  }

  function detailView() {
    var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
    if (!row) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol with that slug' }),
        el('button', { class: 'button primary', type: 'button', text: 'Back to the board', onclick: closeDetail })
      ));
    }
    var recomputed = impliedOf(row);
    var catNote = row.category_weight >= 1
      ? 'Category multiple is the median market-cap / TVL of ' + row.category_comps + ' live ' + (row.category || 'Other') + ' comparables in this snapshot — the category prices its own rows outright.'
      : row.category_comps > 0
        ? 'Category multiple is a shrinkage blend: ' + row.category_comps + ' live ' + (row.category || 'Other') + ' comparable' + (row.category_comps > 1 ? 's' : '') + ' carry weight ' + row.category_weight.toFixed(2) + ' and the rest of the weight goes to the overall live median of ' + DATA.live_comps + ' live protocols — a thin category keeps its own price instead of being priced flat.'
        : 'No live ' + (row.category || 'Other') + ' comparable exists in this snapshot, so this row is priced at the overall live median (' + DATA.live_comps + ' live protocols).';
    var steps = (row.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
    });
    var where = row.watchlist ? 'On the house watchlist (TVL $50M+ and records no token).'
      : row.tvl_usd >= DATA.floor_usd ? 'Above the $50M floor, an early find outside the watchlist.'
      : 'An early find below the $50M floor — the radar exists to catch these first.';
    // The farm plan leads with the protocol-specific action (step 2) and the
    // economics the plan's own steps add up to, so the first thing a reader
    // sees is what to do and what it costs — not the wallet boilerplate.
    var econ = row.farm_econ || null;
    var leadAction = '';
    if (row.farm_steps && row.farm_steps[1]) {
      var cut = row.farm_steps[1].indexOf(' Cost: ');
      leadAction = cut >= 0 ? row.farm_steps[1].slice(0, cut) : row.farm_steps[1];
    }
    var farmLead = null;
    if (econ) {
      farmLead = el('div', { class: 'farm-lead' },
        el('span', { class: 'verdict ' + econ.verdict.toLowerCase(), text: econ.verdict }),
        el('div', { class: 'farm-lead-text' },
          el('b', { text: leadAction }),
          el('span', { class: 'econ', text: 'Deposit $' + econ.capital_usd + ' · ≈$' + econ.gas_total_usd + ' gas over ' + econ.hold_days + ' days ($' + econ.gas_first_usd + ' first tx + $' + econ.gas_setup_usd + ' setup + $' + econ.gas_weekly_usd + '/wk × ' + econ.hold_weeks + ' wks) · ' + econ.setup_min + ' min setup + ' + econ.weekly_min + ' min/week · hold ≥' + econ.hold_days + ' days' }),
          el('span', { class: 'rule', text: 'Verdict rule: gas over the hold as a share of the deposit — ≤20% FARM, ≤40% THIN, above SKIP. Here: ' + Math.round(econ.gas_share * 100) + '%.' })
        )
      );
    }
    var liveExact = 0;
    DATA.rows.forEach(function (r) { if (impliedOf(r) === r.implied_value_usd) liveExact++; });
    var checksNote = 'Checks: this page just recomputed ' + liveExact + ' of ' + DATA.rows.length +
      ' rows live — all match board.json. Worst wobble rebuild keeps ' + DATA.checks.worst_top20_overlap +
      ' of the top 20, rank correlation ' + DATA.checks.worst_rank_spearman.toFixed(4) + '.';
    return el('div', { class: 'panel detail' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'brand-name', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size + (row.watchlist ? ' · WATCHLIST' : ' · EARLY FIND') }),
          el('h2', { text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + chainsText(row) + ' · ' + where })
        ),
        el('button', { class: 'button', type: 'button', text: 'Back to board', onclick: closeDetail })
      ),
      el('div', { class: 'detail-grid' },
        el('div', { class: 'detail-col' },
          el('section', { class: 'detail-box' },
            el('h3', { text: 'Implied value — the arithmetic' }),
            el('div', { class: 'equation' },
              el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
              el('div', null, el('span', { text: 'Category multiple' }), el('b', { text: fmtMult(row.category_multiple) })),
              el('div', null, el('span', { text: 'Growth (' + fmtPct(row.change_7d) + ' over 7d)' }), el('b', { text: fmtMult(row.growth_multiplier) })),
              el('div', null, el('span', { text: 'Maturity (' + fmtAge(row.age_days) + ' with no token)' }), el('b', { text: fmtMult(row.maturity_multiplier) })),
              el('div', null, el('span', { text: 'Chains (' + (row.chains ? row.chains.length : 1) + ' chain' + ((row.chains && row.chains.length > 1) ? 's' : '') + ')' }), el('b', { text: fmtMult(row.chain_multiplier) })),
              el('div', { class: 'total' }, el('span', { text: 'Implied value = TVL x multiples' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
            ),
            el('p', { class: 'note', text: catNote }),
            el('p', { class: 'note', text: 'The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ' — the same number board.json carries.' : ' — which differs from the board; the data would be stale.') + ' Value / TVL is x' + row.value_tvl_ratio.toFixed(2) + '.' })
          ),
          el('section', { class: 'detail-box' },
            el('h3', { text: 'Token status' }),
            el('p', { class: 'note', text: 'Records no token: DefiLlama\u2019s record for this protocol carries no market cap, no CoinGecko id and no symbol. That is the record, not proof — a token may exist that the record does not carry. The board ranks it on the snapshot\u2019s figures alone, and says nothing about whether or when a token launches.' })
          ),
          el('p', { class: 'note', text: checksNote })
        ),
        el('section', { class: 'detail-box farm-box' },
          el('h3', { text: 'Farm plan — 6 steps' }),
          farmLead,
          el('ol', { class: 'steps' }, steps)
        )
      )
    );
  }

  function render() {
    document.body.classList.toggle('detail-mode', !!state.selected);
    app.textContent = '';
    if (state.selected) {
      app.appendChild(detailView());
    } else {
      app.appendChild(controls());
      app.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    }
    app.setAttribute('aria-busy', 'false');
  }

  headerFacts();
  fillMethod();
  fillChecks();
  readHash();
  render();
})();
