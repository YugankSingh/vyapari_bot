import puppeteer, { Page, Browser } from "puppeteer"
import { delay } from "./util/delay"
import { setState } from "./util/setState"
import path from "path"

let telegramLastMessageIndex = 0

// @ts-ignore
const telegramChannelUrlProd = "https://web.telegram.org/a/#-1001531504434"
// @ts-ignore
const telegramChannelUrlDev = "https://web.telegram.org/a/#-1001829325427"
// @ts-ignore
const qoutexTradingUrlProd = "https://qxbroker.com/en/trade"
// @ts-ignore
const qoutexTradingUrlDev = "https://qxbroker.com/en/demo-trade"

const telegramInitialUrl = "https://web.telegram.org"
const telegramChannelUrl = telegramChannelUrlProd
const qoutexInitialUrl = "https://qxbroker.com/en"
const qoutexTradingUrl = qoutexTradingUrlDev
const qoutexStateFile = "../state/qoutexState.json"
const telegramStateFile = "../state/telegramState.json"
const messageCheckDelay = 200

let amount = 1000

type Signal = "DOWN" | "UP"
type BettingData = {
	currency: string
	minutes: number
	signal: Signal
}

// document.querySelector(".mobile-time-input input").value = "00:05:00"

const getMessageIndex = (messageID: string) =>
	Number(messageID.replace("message", "") || 0)

const checkIfImportantMessage = (message: string) => {
	const lines = message.split("\n")
	return lines[0].toLowerCase().trim() === "follow the signal"
}
const extractBettingDataFromString = (str: string): BettingData => {
	const lines = str.split("\n")
	const currency = lines[2].split(" ")[3]
	if (currency.length !== 7)
		throw new Error("Invalid Currency \n" + JSON.stringify(lines, null, 2))
	const minutes = parseInt(lines[4].split(" ")[3])
	if (!minutes || lines[4].split(" ")[4] !== "minutes")
		throw new Error("Invalid time \n" + JSON.stringify(lines, null, 2))
	let signalString = lines[6].split(" ")[3]
	let signal: Signal
	if (signalString === '"UP"') signal = "UP"
	else if (signalString === '"DOWN"') signal = "DOWN"
	else throw new Error("Invalid signal \n" + JSON.stringify(lines, null, 2))
	return { currency, minutes, signal }
}

function replaceAllSpacesExceptNewlines(str) {
	// Use a regular expression to match all types of spaces (\s) except newline (\n)
	// Replace them with a normal space
	return str.replace(/[^\S\n]/g, " ")
}

const initializeTelegramPage = async (browser: Browser) => {
	const telegramPage = await browser.newPage()
	await telegramPage.goto(telegramInitialUrl)
	await setState(telegramPage, path.resolve(__dirname, telegramStateFile))
	await telegramPage.goto(telegramChannelUrl)
	if (telegramPage.url() !== telegramChannelUrl)
		throw new Error(
			`Telegram Page URL is wrong. Unabel to open the telegramChannelUrl = ${telegramChannelUrl}`
		)
	return telegramPage
}

const initializeQoutexPage = async (browser: Browser) => {
	const qoutexPage = await browser.newPage()
	await qoutexPage.goto(qoutexInitialUrl)
	await setState(qoutexPage, path.resolve(__dirname, qoutexStateFile))
	await qoutexPage.goto(qoutexTradingUrl)
	if (qoutexPage.url() !== qoutexTradingUrl)
		throw new Error(
			`qoutexPage Page URL is wrong. Unabel to open the qoutexStateFile = ${qoutexStateFile}`
		)
	return qoutexPage
}

const getLastMessageIndex = async (telegramPage: Page) => {
	await telegramPage.waitForSelector(".Message:last-child")
	const lastMessageId = await telegramPage.evaluate(() => {
		return document.querySelector(".Message:last-child").id || "message0"
	})
	console.info("telegram : lastMessageId", lastMessageId)

	return getMessageIndex(lastMessageId)
}
const telegramScrapeNewMessages = async (
	telegramPage: Page
): Promise<{ newMessages: string[]; newLastMessageIndex: number }> => {
	return await telegramPage.evaluate(lastMessageIndex => {
		const getMessageIndex = (messageID: string) =>
			Number(messageID.replace("message", ""))

		// select all messages
		const messages = document.querySelectorAll(".Message")
		const newMessages = []

		// filter the messages that are sent after the last recorded message.
		// extracts only the text.
		messages.forEach(message => {
			const messageIndex = getMessageIndex(message.id)
			const isMessageNew = messageIndex > lastMessageIndex
			// console.log(isMessageNew, messageIndex, lastMessageIndex, message)
			if (isMessageNew) {
				try {
					// @ts-ignore
					const messageText = message.querySelector(".text-content").innerText
					newMessages.push(messageText)
				} catch (error) {
					console.error(error)
				}
			}
			lastMessageIndex = Math.max(messageIndex, lastMessageIndex)
		})
		return { newMessages, newLastMessageIndex: lastMessageIndex }
	}, telegramLastMessageIndex)
}

const clickRemoveAndTypeTextOnElement = async (
	page: Page,
	selector: string,
	value: string,
	backspaces: number = 20
) => {
	await page.focus(selector) // Focus on the input field
	while (backspaces--) await page.keyboard.press("Backspace") // press backspace, to remove the text
	const valueChars = value.split("")
	for (let char of valueChars) {
		await page.keyboard.type(char)
		const returnedValue = await page.evaluate(selector => {
			// @ts-ignore
			return document.querySelector(selector).value
		}, selector)
		console.info(returnedValue)
	}
}

const setInvestmentTimeQoutexPage = async (
	minutes: number,
	qoutexPage: Page
) => {
	if (minutes < 1 || minutes >= 60)
		throw new Error("Invalid minutes should be inside 1 and 59")
	let minutesString = minutes + ""
	if (minutesString.length < 2) {
		minutesString = "0" + minutesString
	}

	// no need to add ":" as the keyboard needs to just type the time values
	const timeString = "00" + minutesString + "00"
	const timeStringWithColon = "00:" + minutesString + ":00"
	console.info(timeString)
	const timeInputElementSelector = ".mobile-time-input"
	const timeInputSelector = ".mobile-time-input  .mobile-time-input__block"
	const setManuallySelector = ".mobile-time-input__options-manually"

	await qoutexPage.waitForSelector(timeInputElementSelector)
	await qoutexPage.click(timeInputElementSelector)

	const shouldClickOnForSetManuallySelector: boolean =
		await qoutexPage.evaluate(timeInputSelector => {
			return !!document.querySelector(timeInputSelector).attributes["disabled"]
		}, timeInputSelector)

	if (shouldClickOnForSetManuallySelector) {
		await qoutexPage.waitForSelector(setManuallySelector)
		await qoutexPage.click(setManuallySelector)
	}

	await clickRemoveAndTypeTextOnElement(
		qoutexPage,
		timeInputSelector,
		timeString,
		20
	)
	const timeInputValue = await qoutexPage.evaluate(timeInputSelector => {
		// @ts-ignore
		return document.querySelector(timeInputSelector).value
	}, timeInputSelector)
	console.info(
		"time",
		JSON.stringify(timeStringWithColon),
		JSON.stringify(timeInputValue)
	)
	if (timeStringWithColon !== timeInputValue)
		throw new Error("time input value doesn't match the timeInputString")
}
const setInvestmentAmountQoutexPage = async (
	investmentAmount: number,
	qoutexPage: Page
) => {
	const invesmentAmountInputSelector = ".section-deal__investment input"
	await clickRemoveAndTypeTextOnElement(
		qoutexPage,
		invesmentAmountInputSelector,
		investmentAmount + ""
	)

	let investmentAmountValue: string = await qoutexPage.evaluate(
		invesmentAmountInputSelector => {
			// @ts-ignore
			return document.querySelector(invesmentAmountInputSelector).value
		},
		invesmentAmountInputSelector
	)

	investmentAmountValue = investmentAmountValue.substring(
		0,
		investmentAmountValue.length - 2
	)
	investmentAmountValue = investmentAmountValue.replaceAll(",", "")

	const investmentAmountString = investmentAmount + ""
	console.info("investment amount", investmentAmountValue, investmentAmountString)
	if (investmentAmountValue !== investmentAmountString)
		throw new Error("investmentAmountValue and investmentAmount does not match")
}
const pressInvestButtonQoutexPage = async (
	signal: Signal,
	qoutexPage: Page
) => {
	const upButtonSelector =
		".section-deal__put > .section-deal__success > button"
	const downButtonSelector =
		".section-deal__put > .section-deal__danger > button"
	if (signal === "DOWN") qoutexPage.click(downButtonSelector)
	else if (signal === "UP") qoutexPage.click(upButtonSelector)
	else throw new Error("Inalid Signal\n" + JSON.stringify(signal, null, 2))
}

const setInvestmentCurrencyQoutexPage = async (
	currency: string,
	qoutexPage: Page
) => {
	const assetSearchInputSelector = ".asset-select__search-input"

	while (true) {
		try {
			await qoutexPage.click(".asset-select__button")
			await clickRemoveAndTypeTextOnElement(
				qoutexPage,
				assetSearchInputSelector,
				currency,
				20
			)
			break
		} catch (error) {
			console.error(error.message)
		}
	}

	// nth-child is 2 as the first child is header.
	const firstAssetElementSelector =
		".asset-select__content .assets-table__item:nth-child(2) .assets-table__name span"

	let firstAssetText: string = await qoutexPage.evaluate(
		firstAssetElementSelector => {
			// @ts-ignore
			return document.querySelector(firstAssetElementSelector).innerText
		},
		firstAssetElementSelector
	)
	console.info(firstAssetText)
	firstAssetText = replaceAllSpacesExceptNewlines(firstAssetText)
		.toLowerCase()
		.trim()
	if (!firstAssetText.startsWith(currency.toLowerCase()))
		throw new Error(
			"Currency Not found, some other currency is coming as first currency  : " +
				firstAssetText +
				" instead of " +
				currency
		)
	await qoutexPage.click(firstAssetElementSelector)

	let selectedCurrency: string = await qoutexPage.evaluate(() => {
		// @ts-ignore
		return document.querySelector("#tab-active .tab__label").innerText
	})
	selectedCurrency = selectedCurrency.substring(0, 7).toUpperCase()
	console.info("currency", selectedCurrency, currency)
	if (selectedCurrency !== currency.toUpperCase())
		throw new Error("Selected currency does not match!")
}

const withRetries = async (action: Function, tries: number) => {
	while (tries--) {
		try {
			await action()
			return
		} catch (error) {
			console.error(error.message)
		}
	}
	throw new Error("One of the action failed")
}

const betOnQoutex = async (data: BettingData, qoutexPage: Page) => {
	const { currency, minutes, signal } = data
	const tries = 4
	await withRetries(
		() => setInvestmentTimeQoutexPage(minutes, qoutexPage),
		tries
	)
	await withRetries(
		() => setInvestmentAmountQoutexPage(amount, qoutexPage),
		tries
	)
	await withRetries(
		() => setInvestmentCurrencyQoutexPage(currency, qoutexPage),
		tries
	)
	await withRetries(
		() => pressInvestButtonQoutexPage(signal, qoutexPage),
		tries
	)
}

async function run() {
	const browser = await puppeteer.launch({ headless: false })
	const browser2 = await puppeteer.launch({
		headless: false,
		defaultViewport: {
			height: 800,
			width: 800,
		},
	})
	const telegramPagePromise = initializeTelegramPage(browser)
	const qoutexPagePromise = initializeQoutexPage(browser2)
	const [telegramPage, qoutexPage] = await Promise.all([
		telegramPagePromise,
		qoutexPagePromise,
	])

	console.info("telegram page url - ", telegramPage.url())
	console.info("qoutex page url - ", qoutexPage.url())

	// let j = 0

	// while (j < 20) {
	// 	await qoutexPage.screenshot({ path: `${j}qoutexPage.png` })
	// 	j++
	// 	await delay(300)
	// }

	const timeInputSelector = ".mobile-time-input  .mobile-time-input__block"
	const lastMessageSelector = ".Message:last-child"
	await telegramPage.waitForSelector(lastMessageSelector)
	console.info("Telegram launched, ready to interact")
	await qoutexPage.waitForSelector(timeInputSelector)
	console.info("Qoutex launched, ready to interact")

	await telegramPage.evaluate(() => {
		function scrollToBottom() {
			var div = document.querySelector(".MessageList")
			div.scrollTop = div.scrollHeight
		}
		setInterval(scrollToBottom, 1000)
	})

	telegramLastMessageIndex = await getLastMessageIndex(telegramPage)

	let isFirstIteration = true
	while (true) {
		try {
			await delay(messageCheckDelay)

			const { newMessages, newLastMessageIndex } =
				await telegramScrapeNewMessages(telegramPage)
			telegramLastMessageIndex = newLastMessageIndex

			// sometimes it gets the old messages as new messages in first iteration.
			if (isFirstIteration) {
				isFirstIteration = false
				continue
			}

			// contine if there are no new messsages
			if (!newMessages.length) continue
			console.info("New Messages - \n", JSON.stringify(newMessages, null, 2))

			// filter only those messages that start with a particular string
			let importantMessages = newMessages.filter(message =>
				checkIfImportantMessage(message)
			)
			// this makes sure that &nbsp; is replace by " "
			importantMessages = importantMessages.map(message =>
				replaceAllSpacesExceptNewlines(message)
			)
			// contine if there are no important messsages
			if (!importantMessages.length) continue

			console.info(
				"New Important Messages - \n",
				JSON.stringify(importantMessages, null, 2)
			)

			if (importantMessages.length > 1) {
				throw new Error("More than 1 tip at a time, Can't compute")
			}
			console.info("before bet : ", Date.now())
			const bettingData = extractBettingDataFromString(importantMessages[0])

			console.info("bet on ", bettingData)
			await betOnQoutex(bettingData, qoutexPage)
			console.info("after bet : ", Date.now())
		} catch (error) {
			console.error(error.message)
		}
	}
}

run().catch(error => console.error(error))
