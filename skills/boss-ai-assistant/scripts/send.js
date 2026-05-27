/**
 * BOSS直聘 send message — via UI automation on chat page.
 * Supports both boss and geek sides.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { requirePage, navigateToChat, navigateToGeekChat, findFriendByUid, clickCandidateInList, typeAndSendMessage, verbose } from './utils.js';
import { EmptyResultError, selectorError, CommandExecutionError } from '@jackwener/opencli/errors';

cli({
    site: 'boss',
    name: 'send',
    access: 'write',
    description: 'BOSS直聘发送聊天消息（招聘端/求职端）',
    domain: 'www.zhipin.com',
    strategy: Strategy.COOKIE,
    navigateBefore: false,
    browser: true,
    args: [
        { name: 'uid', positional: true, required: true, help: 'Encrypted UID (boss side) or company name (geek side)' },
        { name: 'text', required: false, positional: true, help: 'Message text to send (omit when using --exchange)' },
        { name: 'side', default: 'auto', choices: ['auto', 'boss', 'geek'], help: 'Identity side: auto (try boss first), boss (recruiter), or geek (job-seeker)' },
        { name: 'exchange', default: '', choices: ['', 'wechat', 'phone', 'resume'], help: 'Click toolbar button: resume(发简历), wechat(换微信), or phone(换电话)' },
    ],
    columns: ['status', 'detail'],

    func: async (page, kwargs) => {
        requirePage(page);
        const side = kwargs.side || 'auto';

        // ── Geek side ──
        if (side === 'geek') {
            await navigateToGeekChat(page, 5);

            const companyName = kwargs.uid;
            const clicked = await page.evaluate(`
            (() => {
              const target = ${JSON.stringify(companyName)};
              const listEl = document.querySelector('[class*="user-list"],[class*="list-warp"]');
              if (listEl) listEl.scrollTop = 0;

              const items = document.querySelectorAll('li');
              for (const el of items) {
                const text = el.textContent || '';
                if (text.includes(target)) {
                  el.scrollIntoView({ block: 'center' });
                  // CRITICAL: must click avatar <img> to trigger Vue — nothing else works
                  const img = el.querySelector('img');
                  if (img) {
                    img.click();
                    return { clicked: true, via: 'avatar-img' };
                  }
                  el.click();
                  return { clicked: true, via: 'li-fallback' };
                }
              }
              return { clicked: false };
            })()
          `);

            if (!clicked.clicked) {
                throw new CommandExecutionError(
                    `Could not find "${companyName}" in geek chat list`,
                    'Verify the company name matches what is shown in the sidebar.',
                );
            }

            // Wait for the chat editor to appear
            await page.wait({ time: 3 });
            // Also wait for contenteditable to appear
            try {
                await page.wait({ selector: '[contenteditable="true"]', timeout: 8 });
            } catch (_) {
                // Editor might still be loading; try anyway
            }

            // If exchange mode, click the exchange button (same flow as 发简历)
            if (kwargs.exchange) {
                const exchangeLabels = { wechat: '换微信', phone: '换电话', resume: '发简历' };
                const exchangeType = exchangeLabels[kwargs.exchange] || '换微信';
                const exchanged = await page.evaluate(`
                (() => new Promise(resolve => {
                  const target = ${JSON.stringify(exchangeType)};
                  setTimeout(() => {
                    // Search broadly for the button
                    const all = document.querySelectorAll('[class*="toolbar"],[class*="btn-weixin"],[class*="btn-phone"]');
                    const debug = [];
                    for (const b of all) {
                      if (b.offsetParent) debug.push({cls:b.className, text:b.textContent.trim().substring(0,30)});
                    }
                    for (const btn of all) {
                      if (btn.textContent.includes(target) && btn.offsetParent) {
                        // CRITICAL: skip toolbar-btn-content-only elements — they are plain
                        // text wrappers; the actual Vue click handler is on the sibling
                        // .toolbar-btn (or the same element when it has both classes).
                        if (btn.classList.contains('toolbar-btn-content') && !btn.classList.contains('toolbar-btn')) {
                          continue;
                        }
                        btn.click();
                        setTimeout(() => {
                          // Try multiple selectors for the confirm button (BOSS UI changes over time)
                          const sureSelectors = ['.btn-sure-v2', '.btn-sure', '.btn-confirm', '[class*="sure"]', '[class*="confirm"]', '.van-dialog__confirm', '.btn-primary', '.btn-ok'];
                          let sure = null;
                          for (const sel of sureSelectors) {
                            const el = document.querySelector(sel);
                            if (el && el.offsetParent) { sure = el; break; }
                          }
                          // Fallback: search for visible button with matching text
                          if (!sure) {
                            const keywords = ['确定', '确认', '确认交换', '发送'];
                            const all = document.querySelectorAll('button, [role="button"], a.btn, a.button, span[class*="btn"]');
                            for (const el of all) {
                              const txt = el.textContent.trim();
                              if (el.offsetParent && keywords.some(k => txt === k || txt.startsWith(k))) {
                                sure = el; break;
                              }
                            }
                          }
                          // Last resort: search span/div whose own text matches (not container)
                          if (!sure) {
                            const keywords = ['确定', '确认'];
                            const all = document.querySelectorAll('span, div');
                            for (const el of all) {
                              if (!el.offsetParent) continue;
                              // Check own text only (first child text node), not full subtree
                              const ownText = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
                              if (keywords.some(k => ownText === k)) {
                                sure = el; break;
                              }
                            }
                          }
                          if (sure) { sure.click(); }
                          resolve({ clicked: true, via: target, clickCls: btn.className, sureFound: !!(sure), sureCls: sure ? sure.className : '', sureTxt: sure ? sure.textContent.trim().substring(0,20) : '', debug: debug });
                        }, 1500);
                        return;
                      }
                    }
                    resolve({ clicked: false, debug: debug, target: target });
                  }, 400);
                }))()
              `);
                verbose(`Exchange debug: ${JSON.stringify(exchanged)}`);
                if (!exchanged.clicked) {
                    throw new CommandExecutionError(`Could not find ${exchangeType} button for ${companyName}`);
                }
                await page.wait({ time: 1 });
                return [{ status: 'exchanged', detail: `Geek: ${exchangeType} sent for ${companyName}` }];
            }

            // Use direct execCommand + btn-send (typeAndSendMessage selectors don't match geek page)
            const sent = await page.evaluate(`
            (() => {
              const msg = ${JSON.stringify(kwargs.text)};
              // Step 1: type into contenteditable
              const selectors = ['.chat-input[contenteditable="true"]', '.chat-editor [contenteditable="true"]', '[contenteditable="true"]'];
              let el = null;
              for (const sel of selectors) {
                el = document.querySelector(sel);
                if (el && el.offsetParent !== null) break;
              }
              if (!el) return { ok: false, reason: 'no contenteditable found' };
              el.focus();
              document.execCommand('insertText', false, msg);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));

              // Step 2: wait a tick then click send
              return new Promise(resolve => {
                setTimeout(() => {
                  const btn = document.querySelector('.btn-send');
                  if (btn && !btn.classList.contains('disabled')) {
                    btn.click();
                    resolve({ ok: true, via: 'btn-send' });
                  } else {
                    // Fallback: press Enter on contenteditable
                    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                    resolve({ ok: true, via: 'enter-key' });
                  }
                }, 500);
              });
            })()
          `);
            if (!sent?.ok) {
                throw new CommandExecutionError(`Failed to send: ${sent?.reason || 'unknown'}`);
            }

            await page.wait({ time: 1 });
            return [{ status: 'sent', detail: `Geek: sent to ${companyName}: ${kwargs.text}` }];
        }

        // ── Boss side ──
        await navigateToChat(page, 3);
        const friend = await findFriendByUid(page, kwargs.uid, { maxPages: 5 });
        if (!friend)
            throw new EmptyResultError('boss candidate search', '请确认 uid 是否正确');
        const numericUid = friend.uid;
        const friendName = friend.name || '候选人';
        const clickOk = await clickCandidateInList(page, numericUid);
        if (!clickOk) {
            throw selectorError('聊天列表中的用户', '请确认聊天列表中有此人');
        }
        await page.wait({ time: 2 });
        const sent = await typeAndSendMessage(page, kwargs.text);
        if (!sent) {
            throw selectorError('消息输入框', '聊天页面 UI 可能已改变');
        }
        await page.wait({ time: 1 });
        return [{ status: 'sent', detail: `Boss: sent to ${friendName}: ${kwargs.text}` }];
    },
});
