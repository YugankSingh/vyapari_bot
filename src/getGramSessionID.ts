import * as dotenv from "dotenv"
dotenv.config()
import input from "input" // npm i input
import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions"
import fs from "fs"
import path from "path"

const telegramStateFile = path.resolve(__dirname, "../state/telegramState.json")
const apiId = parseInt(process.env.TELEGRAM_API_ID)
const apiHash = process.env.TELEGRAM_API_HASH
const stringSession = new StringSession("")

;(async () => {
	console.log("Loading interactive example...")
	const client = new TelegramClient(stringSession, apiId, apiHash, {
		connectionRetries: 5,
	})
	await client.start({
		phoneNumber: async () => await input.text("number ?"),
		password: async () => await input.text("password?"),
		phoneCode: async () => await input.text("Code ?"),
		onError: err => console.log(err),
	})
	console.log("You should now be connected.")
	const sessionString: string = client.session.save() as unknown as string
	if (!sessionString) {
		throw new Error("Invalid Session ID String provided")
	}

	fs.writeFileSync(
		telegramStateFile,
		JSON.stringify({ sessionString }, null, 2)
	)

	await client.sendMessage("me", {
		message: `Logged in to vyapari bot at ${new Date().toLocaleString()}`,
	})
	process.exit(0)
})()
