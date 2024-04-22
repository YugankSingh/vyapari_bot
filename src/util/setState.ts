import { Page } from "puppeteer"
import fs from "fs"

export const setState = async (page: Page, stateFilePath: string) => {
	const savedState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"))
	if (!savedState)
		throw new Error(`Invalid State Path - ${stateFilePath}, State not found.`)

	await page.setCookie(...savedState.cookies)

	await page.evaluate(data => {
		data = JSON.parse(data)
		Object.keys(data).forEach(key => {
			localStorage.setItem(key, data[key])
		})
	}, savedState.localStorage)

	await page.evaluate(data => {
		data = JSON.parse(data)
		Object.keys(data).forEach(key => {
			sessionStorage.setItem(key, data[key])
		})
	}, savedState.sessionStorage)
}
