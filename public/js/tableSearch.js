(function () {
  function textOf(row) {
    return (row.getAttribute('data-filter') + ' ' + row.textContent).toLowerCase();
  }

  function initPanel(panel) {
    var table = panel.querySelector('table');
    if (!table || !table.tBodies.length) return;

    var input = panel.querySelector(
      '.list-controls input[type="text"], .list-controls input[type="search"], .list-header input, .records-header input, .table-search input'
    );
    var selects = Array.prototype.slice.call(panel.querySelectorAll('.list-controls select, .records-header select'));
    var footer = panel.querySelector('.table-footer span');
    var footerNoun = '';
    if (footer) {
      var nounMatch = footer.textContent.match(/of\s+\d+\s+(.+)$/i);
      footerNoun = nounMatch ? nounMatch[1].trim() : 'records';
    }

    var body = table.tBodies[0];
    var dataRows = Array.prototype.slice.call(body.rows).filter(function (row) {
      return !row.querySelector('td[colspan]');
    });
    if (!dataRows.length && !input && !selects.length) return;

    var headerCells = table.tHead ? table.tHead.rows[0].cells.length : 1;
    var emptyRow = null;

    function apply() {
      var query = (input && input.value ? input.value : '').trim().toLowerCase();
      var visible = 0;

      dataRows.forEach(function (row) {
        var haystack = textOf(row);
        var show = !query || haystack.indexOf(query) !== -1;

        selects.forEach(function (select) {
          if (show && select.value) {
            if (haystack.indexOf(select.value.toLowerCase()) === -1) {
              show = false;
            }
          }
        });

        row.style.display = show ? '' : 'none';
        if (show) visible++;
      });

      if (footer) {
        footer.textContent = 'Showing ' + visible + ' of ' + dataRows.length + ' ' + footerNoun;
      }

      if (visible === 0 && dataRows.length) {
        if (!emptyRow) {
          emptyRow = body.insertRow();
          var cell = emptyRow.insertCell();
          cell.colSpan = headerCells;
          cell.textContent = 'No matching records found.';
          cell.style.textAlign = 'center';
          cell.style.padding = '20px';
          cell.style.color = '#64748b';
        }
        emptyRow.style.display = '';
      } else if (emptyRow) {
        emptyRow.style.display = 'none';
      }
    }

    if (input) input.addEventListener('input', apply);
    selects.forEach(function (select) {
      select.addEventListener('change', apply);
    });

    var params = new URLSearchParams(window.location.search);
    var touched = false;

    if (input && params.get('q')) {
      input.value = params.get('q');
      touched = true;
    }

    selects.forEach(function (select) {
      var keys = [select.id, select.name, select.id.replace(/Filter$/i, '')];
      params.forEach(function (value, key) {
        if (keys.some(function (k) { return k && k.toLowerCase() === key.toLowerCase(); })) {
          if (Array.prototype.some.call(select.options, function (o) { return o.value === value; })) {
            select.value = value;
            touched = true;
          }
        }
      });
    });

    if (touched) apply();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var panels = document.querySelectorAll('.card-panel, .records-card');
    Array.prototype.forEach.call(panels, initPanel);
  });
})();
