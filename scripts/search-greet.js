/**
 * BOSS直聘 search-greet — search jobs and click "立即沟通" for each result.
 * Flow: search page → click job card → click "立即沟通" button → repeat
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { requirePage, verbose } from './utils.js';

cli({
    site: 'boss',
    name: 'search-greet',
    access: 'write',
    description: 'BOSS直聘搜索职位并逐个点击"立即沟通"',
    domain: 'www.zhipin.com',
    strategy: Strategy.COOKIE,
    navigateBefore: true,
    browser: true,
    args: [
        { name: 'query', positional: true, required: true, help: 'Search keyword (e.g. 营养师)' },
        { name: 'city', default: '北京', help: 'City name' },
        { name: 'limit', type: 'int', default: 10, help: 'Max results to greet' },
    ],
    columns: ['name', 'company', 'status', 'detail'],

    func: async (page, kwargs) => {
        requirePage(page);
        const query = kwargs.query;
        const city = kwargs.city || '北京';
        const limit = kwargs.limit || 10;

        const CITY_CODES = {
            '北京': '101010100', '上海': '101020100', '广州': '101280100',
            '深圳': '101280600', '杭州': '101210100', '成都': '101270100',
            '南京': '101190100', '武汉': '101200100', '西安': '101110100',
        };
        const cityCode = CITY_CODES[city] || '101010100';
        const searchUrl = `https://www.zhipin.com/web/geek/jobs?query=${encodeURIComponent(query)}&city=${cityCode}`;

        verbose(`Navigating to search: ${searchUrl}`);
        await page.goto(searchUrl);
        await page.wait({ time: 5 });

        // Step 1: Read job cards from .rec-job-list > li
        const jobCards = await page.evaluate(`
        (() => {
          const limit = ${limit};
          const results = [];
          const list = document.querySelector('.rec-job-list');
          if (!list) return results;
          const items = list.querySelectorAll('li');
          for (const li of items) {
            if (!li.offsetParent) continue;
            // Get the job link
            const link = li.querySelector('a[href*="job_detail"]');
            if (!link) continue;
            const top = Math.round(link.getBoundingClientRect().top);
            if (results.some(r => Math.abs(r.top - top) < 5)) continue;
            // Extract: job name is in [class*="job-name"] span, salary is in [class*="red"] span
            const jobName = li.querySelector('[class*="job-name"]')?.textContent?.trim() || '';
            const salary = li.querySelector('[class*="red"]')?.textContent?.trim() || '';
            const companyName = li.querySelector('[class*="company-name"]')?.textContent?.trim() || '';
            const label = jobName + (salary ? ' ' + salary : '') + (companyName ? ' @ ' + companyName : '');
            const jobNameKey = jobName.substring(0, 30);
            results.push({ key: jobNameKey, text: label.substring(0, 80) });
            if (results.length >= limit) break;
          }
          return results;
        })()
      `);
        verbose(`Found ${jobCards.length} job cards`);

        if (jobCards.length === 0) {
            return [{ name: '-', company: '-', status: 'no results', detail: 'No job cards found' }];
        }

        const results = [];
        for (let i = 0; i < jobCards.length; i++) {
            const job = jobCards[i];
            try {
                // Step 2: Click the job card by matching job name
                const jobKey = JSON.stringify(job.key);
                const clicked = await page.evaluate(`
                ((targetKey) => {
                  const list = document.querySelector('.rec-job-list');
                  if (!list) return false;
                  const items = list.querySelectorAll('li');
                  for (const li of items) {
                    const nameEl = li.querySelector('[class*="job-name"]');
                    const name = nameEl ? nameEl.textContent.trim() : '';
                    if (name.includes(targetKey)) {
                      li.scrollIntoView({ block: 'center' });
                      const link = li.querySelector('a[href*="job_detail"]');
                      if (link) link.click();
                      else li.click();
                      return true;
                    }
                  }
                  return false;
                })(${jobKey})
              `);

                if (!clicked) {
                    results.push({ name: job.text, company: '', status: 'skip', detail: 'Could not click' });
                    continue;
                }

                await page.wait({ time: 3 });

                // Step 3: Find and click "立即沟通" button, then verify success
                const greeted = await page.evaluate(`
                (() => new Promise(resolve => {
                  setTimeout(() => {
                    // Find "立即沟通" button
                    let greetBtn = null;
                    const all = document.querySelectorAll('button, [role="button"], a, span, div');
                    for (const el of all) {
                      const txt = (el.textContent || '').trim();
                      if (txt === '立即沟通' && el.offsetParent) {
                        greetBtn = el;
                        break;
                      }
                    }
                    if (!greetBtn) {
                      // Maybe already greeted — check for "继续沟通"
                      for (const el of all) {
                        const txt = (el.textContent || '').trim();
                        if (txt.includes('继续沟通') && el.offsetParent) {
                          resolve({ ok: true, verified: true, reason: 'already-greeted' });
                          return;
                        }
                      }
                      resolve({ ok: false, reason: 'no-greet-btn' });
                      return;
                    }
                    // Click the button
                    greetBtn.click();
                    // Wait and verify
                    setTimeout(() => {
                      // Check if button changed to "继续沟通" or disappeared
                      const all2 = document.querySelectorAll('button, [role="button"], a, span, div');
                      let foundContinue = false;
                      let foundGreet = false;
                      for (const el of all2) {
                        const txt = (el.textContent || '').trim();
                        if (txt === '立即沟通' && el.offsetParent) foundGreet = true;
                        if (txt.includes('继续沟通') && el.offsetParent) foundContinue = true;
                      }
                      if (foundContinue || !foundGreet) {
                        resolve({ ok: true, verified: true, reason: foundContinue ? 'changed-to-continue' : 'btn-gone' });
                      } else {
                        resolve({ ok: true, verified: false, reason: 'btn-still-there' });
                      }
                    }, 1500);
                  }, 500);
                }))()
              `);

                await page.wait({ time: 0.5 });

                if (greeted.ok && greeted.verified) {
                    results.push({ name: job.text, company: '', status: 'greeted', detail: greeted.reason });
                    verbose(`OK: ${job.text} (${greeted.reason})`);
                } else if (greeted.ok && !greeted.verified) {
                    results.push({ name: job.text, company: '', status: 'unverified', detail: '点击了但未确认变化' });
                    verbose(`WARN: ${job.text} - clicked but no change detected`);
                } else {
                    results.push({ name: job.text, company: '', status: 'skipped', detail: greeted.reason || 'no-btn' });
                    verbose(`SKIP: ${job.text} (${greeted.reason})`);
                }

                await page.wait({ time: 1.5 });
            } catch (e) {
                results.push({ name: job.text, company: '', status: 'error', detail: e.message?.substring(0, 60) || 'unknown' });
            }
        }

        return results;
    },
});
