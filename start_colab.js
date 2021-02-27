const puppeteer = require('puppeteer');
const fs = require("fs");
const request = require('request');
const { send } = require('process');

const colab_url = "";
const colab_id = "";
const colab_pw = "";
const drive_id = "";
const drive_pw = "";
const slack_url = "";
const ngrok_key = "";

var all_logs = "";
const pc = {
    'name': 'Chrome Mac',
    'userAgent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.97 Safari/537.36',
    'viewport': {
        'width': 1344,
        'height': 756,
        'deviceScaleFactor': 1,
        'isMobile': false,
        'hasTouch': false,
        'isLandscape': false
    }
};

async function prints(message) {
    request({
        url: slack_url,
        method: 'POST',
        headers: {'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: "Colab Starter",
            channel: "#server-notice",
            icon_emoji: "ghost",
            text: message,
            link_names: 1
        })
    }, (error, response, body) => {
        if (error) {
            return console.error(error);
        }
    });
    console.log("#####  Send Slack  #####");
    console.log(message);
    console.log("########################");
}

async function saveCookie(page, name){
    console.log('save cookie');
    const cookies = await page.cookies();
    if (cookies != "") {
        try {
            fs.writeFileSync(name, JSON.stringify(cookies));
        } catch (err) {
            console.log(err);
            return false;
        }
        return true;
    }
};

async function loadCookie(page, name){
    console.log('load cookie: ' +name);
    let cookie = {};
    try {
        let text = fs.readFileSync(name, "utf-8");
        if (text != "") {
            const cookies = JSON.parse(text);
            if (cookies.length > 0) {
                for (let cookie of cookies) {
                    await page.setCookie(cookie);
                }
            }
        }
    } catch (err) {
        console.log(err);
        return false;
    }
    return true;
}

async function typeSentence(Sentence, page) {
    const isUpperCase = c => {
        return /^[A-Z]+$/g.test(c)
    }
    const isLowerCase = c => {
        return /^[a-z]+$/g.test(c)
    }
    const isNumCase = c => {
        return /^[0-9]+$/g.test(c)
    }
    Array.prototype.forEach.call(Sentence, function(s) {
        if(isUpperCase(s)){
            page.keyboard.down('Shift');
            page.keyboard.press('Key'+s.toUpperCase());
            page.keyboard.up('Shift');
        }else if(isNumCase(s)){
            page.keyboard.press(s);
        }else if(isLowerCase(s)){
            page.keyboard.press('Key'+s.toUpperCase());
        }else{
            page.keyboard.press(s);
        }
    });
}

async function searchTerminalFrame(frames) {
    console.log("search terminal");
    for (let i in frames) {
        try {
            let log = await frames[i].evaluate(content => content.innerHTML, await frames[i].$("div[id='output-area'] pre"));
            if (log.includes('start-colab')) {
                console.log("frame_num: " + String(i));
                return i
            }
        } catch {
        }
    }
    console.log('search terminal: failed');
    return "failed"
}

async function waitForSentence(sentences, frame) {
    all_logs = "";
    console.log("wait for: " + String(sentences));
    let log = "";
    while (true) {
        let logs = await frame.evaluate(content => content.innerHTML, await frame.$("div[id='output-area']"));
        await printLog(logs);
        logs = logs.split("\n");
        for (let log of logs) {
            for (sentence of sentences) {
                if (log == sentence) {
                    return true
                }
            }
        }
    }
}

async function getLog(frame) {
    console.log("get log");
    return await frame.evaluate(content => content.innerHTML, await frame.$("div[id='output-area']"));
}

async function saveHtml(page) {
    console.log("save html");
    var html = await page.evaluate(() => { return document.getElementsByTagName('html')[0].innerHTML });
    await fs.writeFileSync('page.html', html);
}

async function printLog(logs) {
    if (logs != all_logs) {
        console.log(logs.slice(all_logs.length).replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '').replace(/amp;/g, ''));
        all_logs = logs;
    }
}

(async () => {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ],
            //headless: false
        });
        var page = await browser.newPage();
        await page.emulate(pc);
        await loadCookie(page, "colabcookie.json");
        await page.goto(colab_url);
        if (await page.$("input[name='identifier']").then(res => !!res)) {
            console.log('id login');
            console.log('google login');
            await page.waitForSelector("input[name='identifier']", { timeout: 10000 });
            await page.type("input[name='identifier']", colab_id);
            await page.screenshot({ path: 'google_login.png' });
            const nextbtn = await page.$("div[role='button']")
            await nextbtn.click();
        } else {
            console.log('cookie login');
        }
        await page.waitFor(10000);
        await page.screenshot({ path: 'result.png' });
        cookies = await page.cookies();
        await saveCookie(page, "colabcookie.json");

        //start colab
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
        await page.waitFor(10000);
        await page.screenshot({ path: 'startbtn.png' });
        await page.waitFor(10000);
        const frames = page.frames();
        const frame_num = await searchTerminalFrame(frames);
        if (frame_num == "failed") {
            browser.close();
            return
        }

        //ngrok auth
        console.log('ngrok setup');
        await waitForSentence(["(You need to sign up for ngrok and login,)"], frames[frame_num]);
        await page.screenshot({ path: 'ngrok before token.png' });
        await typeSentence(ngrok_key, page);
        await page.keyboard.press('Enter');
        await page.screenshot({ path: 'ngrok after token.png' });
        await waitForSentence(['Select your ngrok region:'], frames[frame_num]);
        await page.waitFor(2000);
        await typeSentence('jp', page);
        await page.keyboard.press('Enter');
        //gdrive auth
        await waitForSentence(['Enter your authorization code:', '/content/drive/My Drive'], frames[frame_num]);
        all_logs = all_logs.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '').replace(/✂️/g, '') + "END LOG";
        const send_ssh_info = all_logs.match(/root\spassword[\s\S]*/g)[0].replace(/((Go\sto\sthis\sURL|\/content\/drive|Enter\syour\sauthorization\scode:|---)[\s\S]*?|END\ｓLOG)\n/gm, "").replace(/\s{4,}/gm, "\n").replace(/(\r?\n)+/g, "\n");
        await prints(send_ssh_info);
        await page.screenshot({ path: 'drive_auth_before.png' });
        const drive_logs = await getLog(frames[frame_num]);
        if (drive_logs.match(/Drive.*?mounted/)) {
            console.log('drive already mounted');
        } else {
            console.log("gdrive setup start");
            await waitForSentence(["Enter your authorization code:"], frames[frame_num]);
            await page.screenshot({ path: 'drive_link.png' });
            let logs = await getLog(frames[frame_num]);
            const gdrive_auth_url = logs.match(/href="https:\/\/accounts.google.com.*?readonly">/)[0].slice(6, -2).split('amp;').join('');
            console.log(gdrive_auth_url);
            const gdrive_auth_page = await browser.newPage();
            await loadCookie(gdrive_auth_page, "drivecookie.json");
            await gdrive_auth_page.goto(gdrive_auth_url);
            await gdrive_auth_page.waitFor(5000);
            await gdrive_auth_page.screenshot({ path: 'google_drive_login_check.png' });
            if (await gdrive_auth_page.$("input[name='signIn']").then(res => !!res)) {
                console.log("drive id login");
                await gdrive_auth_page.waitForSelector("input[name='signIn']", { timeout: 10000 });
                await gdrive_auth_page.type("input[name='Email']", drive_id);
                await gdrive_auth_page.screenshot({ path: 'google_drive_login.png' });
                const drive_nextbtn = await gdrive_auth_page.$("input[name='signIn']");
                await drive_nextbtn.click();
                await gdrive_auth_page.screenshot({ path: 'google_drive_login_next.png' });
            } else {
                console.log("drive cookie login");
                console.log("drive user select");
                const drive_account_btn = await gdrive_auth_page.$("#choose-account-0");
                await drive_account_btn.click();
            }
            await saveCookie(gdrive_auth_page, "drivecookie.json");
            await gdrive_auth_page.screenshot({ path: 'drive_auth_before.png' });
            await gdrive_auth_page.waitForSelector("#submit_approve_access", { timeout: 10000 });
            await gdrive_auth_page.waitFor(10000);
            await gdrive_auth_page.evaluate(() => {
                document.querySelector('#submit_approve_access').click();
            });
            await gdrive_auth_page.waitFor(10000);
            let drive_key = await gdrive_auth_page.title();
            drive_key = drive_key.match(/code=.*?&scope=email/)[0].slice(5, -12);
            await gdrive_auth_page.screenshot({ path: 'drive_auth_after.png' });
            await typeSentence(drive_key, page);
            await page.keyboard.press('Enter');
        }

        await page.waitFor(10000);
        await page.screenshot({ path: 'drive_auth.png' });
        await browser.close();
        return true
    } catch{
        await browser.close();
        return false
    }
})();