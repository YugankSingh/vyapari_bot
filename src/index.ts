import * as dotenv from "dotenv"
dotenv.config()

import puppeteer, { Page, Browser } from "puppeteer"
import { setState } from "./util/setState"
import path from "path"
import { TelegramClient, Api } from "telegram"
import { StringSession } from "telegram/sessions"
import { delay } from "./util/delay"
import telegramLastMessageIndexState from "./lastMessage.json"
import telegramState from "../state/telegramState.json"
import fs from "fs"

const apiId = parseInt(process.env.TELEGRAM_API_ID)
const apiHash = process.env.TELEGRAM_API_HASH
const telegramStringSession = new StringSession(telegramState.sessionString)
const restartBotInMinutes = 15

const telegramChannelChatIDProd = "-1001531504434"
const telegramChannelChatIDDev = "-1001829325427"
const qoutexTradingUrlProd = "https://qxbroker.com/en/trade"
const qoutexTradingUrlDev = "https://qxbroker.com/en/demo-trade"

const telegramEnv: "PROD" | "DEV" = process.env.TELEGRAM_ENV as unknown as
	| "PROD"
	| "DEV"

const qoutexEnv: "PROD" | "DEV" = process.env.QOUTEX_ENV as unknown as
	| "PROD"
	| "DEV"

if (telegramEnv !== "PROD" && telegramEnv !== "DEV")
	throw new Error(`Telegram Env has invalid value, either put "PROD" or "DEV`)
if (qoutexEnv !== "PROD" && qoutexEnv !== "DEV")
	throw new Error(`Qoutex Env has invalid value, either put "PROD" or "DEV`)

const telegramChannelChatID =
	telegramEnv === "PROD" ? telegramChannelChatIDProd : telegramChannelChatIDDev
let currMessageIndex =
	telegramEnv === "PROD"
		? telegramLastMessageIndexState.PROD
		: telegramLastMessageIndexState.DEV

const qoutexInitialUrl = "https://qxbroker.com/en"
const qoutexTradingUrl =
	qoutexEnv === "PROD" ? qoutexTradingUrlProd : qoutexTradingUrlDev
const qoutexStateFile = "../state/qoutexState.json"
const step = 40

let amount = 1000

type Signal = "DOWN" | "UP"
type BettingData = {
	currency: string
	minutes: number
	timeString: string
	signal: Signal
}
const checkIfImportantMessage = (message: string) => {
	const lines = message.split("\n")
	return lines[0].toLowerCase().trim().includes("follow the signal")
}

const extractBettingDataFromString = (
	str: string,
	startTime: number
): BettingData => {
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

	const sellingDateTime = new Date(startTime + minutes * 60 * 1000)
	const sellingHours = ("0" + sellingDateTime.getHours()).slice(-2) // Add leading zero if needed
	const sellingMinutes = ("0" + sellingDateTime.getMinutes()).slice(-2) // Add leading zero if needed
	const timeString = sellingHours + ":" + sellingMinutes

	return { currency, minutes, signal, timeString }
}

function replaceAllSpacesExceptNewlines(str) {
	// Use a regular expression to match all types of spaces (\s) except newline (\n)
	// Replace them with a normal space
	return str.replace(/[^\S\n]/g, " ")
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

const initializeTelegramApi = async () => {
	console.info("Loading telegram user bot...")
	const client = new TelegramClient(telegramStringSession, apiId, apiHash, {
		connectionRetries: 5,
	})
	await client.start({
		phoneNumber: async () => {
			throw new Error("Session ID expired")
		},
		password: async () => {
			throw new Error("Session ID expired")
		},
		phoneCode: async () => {
			throw new Error("Session ID expired")
		},
		onError: err => console.error(err),
	})
	return client
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

// @ts-ignore
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
const setInvestmentSellTimeQoutexPage = async (
	timeString: string,
	qoutexPage: Page
) => {
	console.info(timeString)
	const timeInputElementSelector = ".mobile-time-input"
	const timeInputSelector = ".mobile-time-input  .mobile-time-input__block"

	await qoutexPage.waitForSelector(timeInputElementSelector)
	await qoutexPage.click(timeInputElementSelector)

	const isClicked: boolean = await qoutexPage.evaluate(timeString => {
		// select the time option in qoutex when trading on otc where you can trade with both time and timer.
		{
			const inputTypeSelectorElement = document.querySelector(
				".mobile-time-input__options-tab.active"
			)
			if (
				!!inputTypeSelectorElement &&
				// @ts-ignore
				inputTypeSelectorElement.innerText != "TIME"
			) {
				document
					.querySelectorAll(".mobile-time-input__options-tab ")
					.forEach(el => {
						// @ts-ignore
						if (el.innerText == "TIME")
							// @ts-ignore
							el.click()
					})
			}
		}
		let isClicked = false
		document
			.querySelectorAll(
				".mobile-time-input__options-items > .mobile-time-input__options-item "
			)
			.forEach(el => {
				//@ts-ignore
				console.info(el.innerText)
				//@ts-ignore
				if (el.innerText === timeString) {
					//@ts-ignore
					el.click()
					isClicked = true
				}
			})
		return isClicked
	}, timeString)

	if (!isClicked) {
		throw new Error(" Time input button is not clicked")
	}

	const timeInputValue = await qoutexPage.evaluate(timeInputSelector => {
		// @ts-ignore
		return document.querySelector(timeInputSelector).value
	}, timeInputSelector)
	console.info(
		"time",
		JSON.stringify(timeString),
		JSON.stringify(timeInputValue)
	)
	if (timeString !== timeInputValue)
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
	console.info(
		"investment amount",
		investmentAmountValue,
		investmentAmountString
	)
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
	const { currency, signal, timeString } = data
	const tries = 4
	// await withRetries(
	// 	() => setInvestmentTimeQoutexPage(minutes, qoutexPage),
	// 	tries
	// )
	await withRetries(
		() => setInvestmentSellTimeQoutexPage(timeString, qoutexPage),
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

const findFirstNewMessageIndex = async (
	telegramClient: TelegramClient,
	checkFromIndex: number
): Promise<number> => {
	let shouldFindLastMessage = true

	while (shouldFindLastMessage) {
		const messagesToCheck: number[] = []
		for (let i = 0; i < step + 5; i++) messagesToCheck.push(checkFromIndex + i)
		const result = await telegramClient.invoke(
			new Api.channels.GetMessages({
				channel: telegramChannelChatID,
				// @ts-ignore
				id: messagesToCheck,
			})
		)
		// @ts-ignore
		const messageObjects = result.toJSON().messages
		for (let i = 0; i < step; i++) {
			const currMessage: Api.Message = messageObjects[i]
			const currMessageText = currMessage.message
			const currMessageDocument = currMessage.media
			console.info(
				checkFromIndex + i,
				!currMessageText,
				!currMessageDocument,
				currMessage["className"]
			)
			if (!currMessageText && !currMessageDocument) {
				let isFakeEmptyMessage: boolean = false
				for (let j = 1; j <= 5; j++) {
					const currIndex = i + j
					const currMessage: Api.Message = messageObjects[currIndex]
					const currMessageText = currMessage.message
					const currMessageDocument = currMessage.media
					console.info(
						"check fake --",
						checkFromIndex + currIndex,
						!currMessageText,
						!currMessageDocument,
						currMessage["className"]
					)
					isFakeEmptyMessage = !!currMessageText || !!currMessageDocument
					if (isFakeEmptyMessage) break
				}
				if (isFakeEmptyMessage) {
					console.info("Fake empty Message", currMessage)
					continue
				}

				return checkFromIndex + i
			}
		}

		checkFromIndex += step
	}
	throw new Error("Oops, erorr in finding the first new message index")
	return checkFromIndex
}

const onNewMessage = async (message: Api.Message, qoutexPage: Page) => {
	let messageText: string = message.message

	const chatId = message?.chatId?.toString()
	console.info("\n\nNew message, ")
	console.info("message :", messageText)
	console.info("chatId :", chatId)
	console.info(
		"chatId === telegramChannelChatID",
		`${chatId} === ${telegramChannelChatID}`,
		chatId === telegramChannelChatID
	)
	console.info(
		message.date,
		message.date * 1000,
		new Date(message.date * 1000).toLocaleString()
	)

	if (chatId !== telegramChannelChatID) return
	console.info("new message in important channel")
	const isMessageImportant = checkIfImportantMessage(messageText)
	if (!isMessageImportant) {
		console.info("message is not imoprtant ❌")
		return
	}
	console.info("message is imoprtant ✅")
	messageText = replaceAllSpacesExceptNewlines(messageText)

	console.info("before bet : ", Date.now())
	const bettingData = extractBettingDataFromString(
		messageText,
		message.date * 1000
	)

	console.info("bet on ", bettingData)
	await betOnQoutex(bettingData, qoutexPage)
	console.info("after bet : ", Date.now())
}

// @ts-ignore
async function run() {
	const browserPromise = puppeteer.launch({
		headless: false,
		defaultViewport: {
			height: 800,
			width: 800,
		},
	})
	let shouldRestart = false
	const browser = await browserPromise
	const telegramApiPromise = initializeTelegramApi()

	const qoutexPagePromise = initializeQoutexPage(browser)
	let [telegramClient, qoutexPage] = await Promise.all([
		telegramApiPromise,
		qoutexPagePromise,
	])

	currMessageIndex = await findFirstNewMessageIndex(
		telegramClient,
		currMessageIndex
	)
	fs.writeFileSync(
		path.resolve(__dirname, "./lastMessage.json"),
		JSON.stringify(
			{ ...telegramLastMessageIndexState, [telegramEnv]: currMessageIndex - 5 },
			null,
			2
		)
	)

	console.info("Last message", currMessageIndex - 1)
	console.info("Message we are looking for", currMessageIndex)
	console.info("qoutex page url - ", qoutexPage.url())

	const timeInputSelector = ".mobile-time-input  .mobile-time-input__block"
	await qoutexPage.waitForSelector(timeInputSelector)
	console.info("Qoutex launched, ready to interact")

	const browserCheckIntervalId = setInterval(async () => {
		try {
			const isTimeInputEl = await qoutexPage.evaluate(timeInputSelector => {
				return !!document.querySelector(timeInputSelector)
			}, timeInputSelector)
			if (!isTimeInputEl)
				throw new Error("Time Input Element is not available to select")
		} catch (error) {
			console.info("Browser is detached starting again")
			console.info("error:", error.message)
			shouldRestart = true
			await browser.close()
			clearInterval(browserCheckIntervalId)
		}
	}, 1000)

	try {
		while (!shouldRestart) {
			const result = await telegramClient.invoke(
				new Api.channels.GetMessages({
					channel: telegramChannelChatID,
					// @ts-ignore
					id: [currMessageIndex],
				})
			)

			// @ts-ignore
			const message: Api.Message = result.toJSON().messages[0]
			const messageText = message.message
			const messageMedia = message.media
			if (!!messageText || !!messageMedia) {
				await onNewMessage(message, qoutexPage)
				currMessageIndex++
			}
			await delay(500)
		}

		await browser.close()
		return true
	} catch (error) {
		console.error(error.message)
		await browser.close()
		return false
	}
}

const runWrapper = async () => {
	let i = 0
	const destroyAt = 60 * 1000 * restartBotInMinutes
	setInterval(() => {
		console.log(i / 1000, "seconds past opening", new Date().toLocaleString())
		if (i >= destroyAt) {
			process.exit(23)
		}
		i += 10000
	}, 10000)
	try {
		let shouldKeepRunning = true
		while (shouldKeepRunning) {
			shouldKeepRunning = await run()
		}
	} catch (error) {
		console.error("error in run wrapper : ", error)
	}
}

runWrapper()
