/**
 * Fixture markup for the PSX data portal. `/historical` returns a bare table of
 * daily bars; `/market-watch` returns the whole board. Dates and column orders here
 * cover the variants the parsers are written to tolerate.
 */

export const HISTORICAL_TABLE = `
<table>
  <thead><tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead>
  <tbody>
    <tr><td>Sep 11, 2026</td><td>970.50</td><td>1,014.53</td><td>965.81</td><td>992.15</td><td>395,500</td></tr>
    <tr><td>Sep 10, 2026</td><td>962.00</td><td>975.40</td><td>958.10</td><td>970.50</td><td>288,140</td></tr>
    <tr><td>Sep 09, 2026</td><td>950.75</td><td>968.20</td><td>948.00</td><td>962.00</td><td>412,880</td></tr>
  </tbody>
</table>`;

/** Same data with an extra change column and ISO dates. */
export const HISTORICAL_WITH_CHANGE = `
<table>
  <thead><tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Change</th><th>Volume</th></tr></thead>
  <tbody>
    <tr><td>2026-09-11</td><td>970.50</td><td>1014.53</td><td>965.81</td><td>992.15</td><td>21.65</td><td>395500</td></tr>
    <tr><td>2026-09-10</td><td>962.00</td><td>975.40</td><td>958.10</td><td>970.50</td><td>8.50</td><td>288140</td></tr>
  </tbody>
</table>`;

export const MARKET_WATCH = `
<html><body>
  <table><tr><td>unrelated small table</td></tr></table>
  <table>
    <thead>
      <tr><th>SYMBOL</th><th>SECTOR</th><th>LDCP</th><th>OPEN</th><th>HIGH</th><th>LOW</th><th>CURRENT</th><th>CHANGE</th><th>CHANGE (%)</th><th>VOLUME</th></tr>
    </thead>
    <tbody>
      <tr><td>LUCK</td><td>Cement</td><td>970.50</td><td>970.50</td><td>1,014.53</td><td>965.81</td><td>992.15</td><td>21.65</td><td>2.23</td><td>395,500</td></tr>
      <tr><td>OGDC</td><td>Oil &amp; Gas Exploration Companies</td><td>267.76</td><td>268.00</td><td>275.36</td><td>265.46</td><td>271.27</td><td>3.51</td><td>1.31</td><td>5,210,400</td></tr>
      <tr><td>HBL</td><td>Commercial Banks</td><td>186.42</td><td>187.00</td><td>191.05</td><td>180.36</td><td>190.55</td><td>4.13</td><td>2.22</td><td>1,180,900</td></tr>
      <tr><td>MLCF</td><td>Cement</td><td>62.56</td><td>62.40</td><td>63.99</td><td>60.57</td><td>61.58</td><td>(0.98)</td><td>(1.57)</td><td>1,070,200</td></tr>
      <tr><td>FFC</td><td>Fertilizer</td><td>385.70</td><td>386.00</td><td>398.06</td><td>373.78</td><td>397.73</td><td>12.03</td><td>3.12</td><td>758,100</td></tr>
      <tr><td>SYS</td><td>Technology &amp; Communication</td><td>125.60</td><td>125.00</td><td>126.80</td><td>122.10</td><td>123.86</td><td>(1.74)</td><td>(1.39)</td><td>640,300</td></tr>
    </tbody>
  </table>
</body></html>`;
