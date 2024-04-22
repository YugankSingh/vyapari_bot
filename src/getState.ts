import puppeteer from "puppeteer"
import fs from "fs"
import path from "path"
import { delay } from "./util/delay"

const args = process.argv.slice(2)
const websiteName = args[0]
if (!websiteName || (websiteName !== "qoutex" && websiteName !== "telegram"))
	throw new Error(
		"invalid website name, please provide website name as argument"
	)

let url = ""
let outputFile = "../state/"

if (websiteName === "qoutex") {
	url = "https://qxbroker.com/en/sign-in/"
	outputFile += "qoutexState.json"
} else if (websiteName === "telegram") {
	url = "https://web.telegram.org/"
	outputFile += "telegramState.json"
}

async function saveBrowserContextState() {
	console.log(__dirname)

	const browser = await puppeteer.launch({
		headless: false,
		args: ["--disable-notifications"],
	})
	// const context = browser.defaultBrowserContext()
	// context.overridePermissions("https://web.telegram.org", ["notifications"])
	const page = await browser.newPage()

	// Navigate to a webpage
	await page.goto(url)
	console.log("You have 20s to login\nLOGIN!!!")
	console.log("0s")
	await delay(5 * 1000)
	console.log("5s")
	await delay(5 * 1000)
	console.log("10s")
	await delay(5 * 1000)
	console.log("15s")
	await delay(5 * 1000)
	console.log("20s")
	console.log("Getting State from website")

	const cookies = await page.cookies()
	const localStorage = await page.evaluate(() => {
		return JSON.stringify(window.localStorage)
	})
	const sessionStorage = await page.evaluate(() => {
		return JSON.stringify(window.sessionStorage)
	})

	const savedState = {
		cookies,
		localStorage,
		sessionStorage,
	}

	fs.writeFileSync(
		path.resolve(__dirname, outputFile),
		JSON.stringify(savedState, null, 2)
	)
	await browser.close()
}

// Example usage
saveBrowserContextState().catch(error => console.error(error))
