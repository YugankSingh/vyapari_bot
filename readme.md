
- Step 1  
  Install typescript if not already present
	```
	npm i -g typescript
	```
<br/>


- Step 2   
  install the dependencies using
	```
	npm install
	```

<br/>


- Step 3   
  configure the .env file  
	rename the sample.env file to .env
	and enter the values inside it

<br/>

- Step 4  
  Get the login state for telegram
	```
	npm run getTelgramSession
	```
	now enter the phone number with country code  
	and the code sent to you from telegram  
<br/>

- Step 5  
  Get the login state for qoutex  
	make sure that you are logged in before the window closes, you have 20 seconds to login,  
	if not logged in run the command again.
	```
	npm run getQoutexSession
	```
<br/>

- Step 6  
  Run the bot
	```
	npm start
	```
	make sure that the computer is running and the that computer doesn't go to sleep, while the bot is running.
<br/>
