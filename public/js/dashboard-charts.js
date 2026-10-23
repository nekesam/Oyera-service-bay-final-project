// Draws the two dashboard charts from the JSON the server embeds in the page.
(function () {
  if (typeof Chart === 'undefined') return;
  var holder = document.getElementById('chart-data');
  if (!holder) return;
  var data = JSON.parse(holder.textContent);
  var css = getComputedStyle(document.documentElement);
  var color = function (name) { return css.getPropertyValue(name).trim(); };

  Chart.defaults.font.family = color('--font') || 'Inter, system-ui, sans-serif';
  Chart.defaults.color = color('--ink-faint');

  var revenue = document.getElementById('revenueChart');
  if (revenue) {
    new Chart(revenue, {
      type: 'bar',
      data: {
        labels: data.months.map(function (m) { return m.label; }),
        datasets: [{
          label: 'Revenue (UGX)',
          data: data.months.map(function (m) { return m.revenue; }),
          backgroundColor: color('--brand'),
          borderRadius: 8,
          maxBarThickness: 46
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var jobs = data.months[ctx.dataIndex].jobs;
                return 'UGX ' + ctx.parsed.y.toLocaleString('en-US') + ' · ' + jobs + ' job' + (jobs === 1 ? '' : 's');
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: color('--border') },
            ticks: {
              callback: function (v) { return v >= 1000000 ? v / 1000000 + 'M' : v >= 1000 ? v / 1000 + 'k' : v; }
            }
          }
        }
      }
    });
  }

  var status = document.getElementById('statusChart');
  if (status) {
    var order = data.statusOrder;
    var palette = [color('--ink-faint'), color('--brand'), color('--accent'), color('--success')];
    var counts = order.map(function (s) { return data.statusCounts[s] || 0; });
    new Chart(status, {
      type: 'doughnut',
      data: { labels: order, datasets: [{ data: counts, backgroundColor: palette, borderWidth: 0 }] },
      options: {
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }
      }
    });
  }
})();
