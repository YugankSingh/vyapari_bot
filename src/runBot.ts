import {spawn} from "node:child_process"

const spawnBot = () =>{
	
	const bot = spawn('npm', ['run', 'dev']);

	bot.stdout.on('data', (data) => {
		console.log(`stdout: ${data}`);
	});

	bot.stderr.on('data', (data) => {
		console.error(`stderr: ${data}`);
	});

	bot.on('close', (code) => {
		console.log(`child process exited with code ${code}`);
		if(code == 23){
			spawnBot()
		}
	}); 


}

spawnBot()