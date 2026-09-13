/**
 * Fixture markup in the shape PSX-listed companies' accounts are published in:
 * line items down the left, reporting periods across the top, figures in `Rs '000`,
 * negatives in accounting parentheses.
 *
 * These are stand-ins for khistocks.com's real markup, which could not be fetched
 * from the build environment. They exercise what the parsers actually have to cope
 * with — varied row labels, mixed period header formats, unit scaling, parenthesised
 * negatives, and unrelated tables on the same page — rather than asserting that any
 * particular site markup exists.
 */

export const FINANCIALS_PAGE = `
<html><body>
  <nav><table><tr><td>Home</td><td>Markets</td></tr></table></nav>

  <h3>Income Statement (Rs '000)</h3>
  <table>
    <thead><tr><th>Particulars</th><th>FY2025</th><th>FY2024</th><th>FY2023</th></tr></thead>
    <tbody>
      <tr><td>Net Sales</td><td>420,116,500</td><td>347,902,100</td><td>298,441,700</td></tr>
      <tr><td>Cost of Sales</td><td>(292,560,300)</td><td>(245,118,900)</td><td>(214,003,500)</td></tr>
      <tr><td>Gross Profit</td><td>127,556,200</td><td>102,783,200</td><td>84,438,200</td></tr>
      <tr><td>Operating Profit</td><td>94,031,800</td><td>74,220,600</td><td>59,118,400</td></tr>
      <tr><td>Other Income</td><td>7,530,200</td><td>6,118,300</td><td>4,902,100</td></tr>
      <tr><td>Finance Cost</td><td>(8,014,400)</td><td>(9,220,100)</td><td>(7,655,900)</td></tr>
      <tr><td>Profit Before Taxation</td><td>93,547,600</td><td>71,118,800</td><td>56,364,600</td></tr>
      <tr><td>Taxation</td><td>(31,700,100)</td><td>(24,880,500)</td><td>(19,727,600)</td></tr>
      <tr><td>Profit After Taxation</td><td>61,847,500</td><td>46,238,300</td><td>36,637,000</td></tr>
      <tr><td>Earnings Per Share</td><td>211.08</td><td>157.81</td><td>125.04</td></tr>
    </tbody>
  </table>

  <h3>Balance Sheet (Rs '000)</h3>
  <table>
    <thead><tr><th>Particulars</th><th>FY2025</th><th>FY2024</th><th>FY2023</th></tr></thead>
    <tbody>
      <tr><td>Total Assets</td><td>612,400,000</td><td>548,900,000</td><td>489,200,000</td></tr>
      <tr><td>Current Assets</td><td>238,836,000</td><td>203,093,000</td><td>176,112,000</td></tr>
      <tr><td>Total Current Liabilities</td><td>142,077,000</td><td>131,736,000</td><td>122,300,000</td></tr>
      <tr><td>Total Liabilities</td><td>257,208,000</td><td>241,516,000</td><td>229,924,000</td></tr>
      <tr><td>Issued, Subscribed and Paid up Capital</td><td>2,930,000</td><td>2,930,000</td><td>2,930,000</td></tr>
      <tr><td>Shareholders Equity</td><td>355,192,000</td><td>307,384,000</td><td>259,276,000</td></tr>
    </tbody>
  </table>

  <h3>Cash Flow Statement (Rs '000)</h3>
  <table>
    <thead><tr><th>Particulars</th><th>FY2025</th><th>FY2024</th><th>FY2023</th></tr></thead>
    <tbody>
      <tr><td>Cash Flow From Operating Activities</td><td>78,220,400</td><td>61,004,200</td><td>48,119,700</td></tr>
      <tr><td>Cash Flow From Investing Activities</td><td>(41,118,600)</td><td>(33,442,100)</td><td>(28,004,900)</td></tr>
      <tr><td>Cash Flow From Financing Activities</td><td>(22,003,100)</td><td>(18,776,400)</td><td>(12,118,200)</td></tr>
    </tbody>
  </table>
</body></html>`;

/** Same data, but printed in millions with Mon-YY headers instead of FY labels. */
export const FINANCIALS_MILLIONS = `
<html><body>
  <h3>Profit &amp; Loss (Rs mn)</h3>
  <table>
    <tr><th>Particulars</th><th>Jun-25</th><th>Jun-24</th></tr>
    <tr><td>Turnover</td><td>420,116</td><td>347,902</td></tr>
    <tr><td>Gross Profit</td><td>127,556</td><td>102,783</td></tr>
    <tr><td>Profit after tax</td><td>61,847</td><td>46,238</td></tr>
    <tr><td>EPS</td><td>211.08</td><td>157.81</td></tr>
  </table>
</body></html>`;

export const DIVIDENDS_PAGE = `
<html><body>
  <h3>Dividend Data</h3>
  <table>
    <thead>
      <tr><th>Announced</th><th>Period</th><th>Type</th><th>Rate %</th><th>BC From</th><th>BC To</th></tr>
    </thead>
    <tbody>
      <tr><td>2025-09-18</td><td>Q4 2025</td><td>Cash Dividend</td><td>160%</td><td>2025-09-24</td><td>2025-09-28</td></tr>
      <tr><td>2025-03-20</td><td>Q2 2025</td><td>Bonus Shares</td><td>25%</td><td>2025-03-26</td><td>2025-03-30</td></tr>
      <tr><td>2024-09-19</td><td>Q4 2024</td><td>Cash Dividend</td><td>120%</td><td>2024-09-25</td><td>2024-09-29</td></tr>
    </tbody>
  </table>
</body></html>`;

/** Navigation shaped like a site index, for the link-discovery crawler. */
export const INDEX_PAGE = `
<html><body>
  <ul>
    <li><a href="/company/LUCK">Lucky Cement Limited — Company Profile</a></li>
    <li><a href="/reports/financial-statements/LUCK">LUCK Financial Statements</a></li>
    <li><a href="/reports/dividend-data/LUCK">LUCK Dividend &amp; Payout History</a></li>
    <li><a href="/reports/financial-statements/DGKC">DGKC Financial Statements</a></li>
    <li><a href="https://example.com/LUCK/financials">Offsite mirror</a></li>
    <li><a href="/about">About us</a></li>
    <li><a href="/company/LUCKY-STAR">Lucky Star Textiles</a></li>
  </ul>
</body></html>`;

/**
 * khistocks publishes payouts for every listed company on one page, so the parser
 * has to pick out the rows belonging to the symbol being viewed.
 */
export const DIVIDENDS_ALL_COMPANIES = `
<html><body>
  <h3>Dividend History (%)</h3>
  <table>
    <thead>
      <tr><th>Symbol</th><th>Announced</th><th>Period</th><th>Type</th><th>Rate %</th><th>BC From</th><th>BC To</th></tr>
    </thead>
    <tbody>
      <tr><td>LUCK</td><td>2025-09-18</td><td>Q4 2025</td><td>Cash Dividend</td><td>160%</td><td>2025-09-24</td><td>2025-09-28</td></tr>
      <tr><td>DGKC</td><td>2025-09-17</td><td>Q4 2025</td><td>Cash Dividend</td><td>25%</td><td>2025-09-23</td><td>2025-09-27</td></tr>
      <tr><td>LUCK</td><td>2024-09-19</td><td>Q4 2024</td><td>Cash Dividend</td><td>120%</td><td>2024-09-25</td><td>2024-09-29</td></tr>
      <tr><td>LUCKY</td><td>2024-08-01</td><td>Q3 2024</td><td>Cash Dividend</td><td>40%</td><td>2024-08-07</td><td>2024-08-11</td></tr>
      <tr><td>MLCF</td><td>2024-09-12</td><td>Q4 2024</td><td>Bonus Shares</td><td>10%</td><td>2024-09-18</td><td>2024-09-22</td></tr>
    </tbody>
  </table>
</body></html>`;
