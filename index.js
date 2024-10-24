import fs from 'node:fs'
import readline from 'node:readline/promises'
import path from 'node:path'
const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs')

function jsonToCSV(arrOfObj) {
	const csvRows = []
	const headers = Object.keys(arrOfObj[0])
	csvRows.push(headers.join(','))

	for (const obj of arrOfObj) {
		const row = headers.map(el => `"${String(obj[el]).replace(/"/g, '""')}"`).join(',')
		csvRows.push(row)
	}

	return csvRows.join('\n')
}

async function parsePage(pageNum, loadedPdf) {
	const text = await loadedPdf.getPage(pageNum).then(r => r.getTextContent())
	const items = text.items
		.map(el => {
			el.str = el.str.trim()
			return el
		})
		.filter(el => el.str)
		.slice(9, -1)

	const arr = []
	for (let i = 0; i < items.length; i += 5) {
		const obj = {
			sl: Number(items[i].str),
			roll: Number(items[i + 1].str),
			name: (() => {
				const nameArr = [items[i + 2].str]
				while (isNaN(items[i + 3].str)) {
					nameArr.push(items[i + 3].str)
					i++
				}
				return nameArr.join(' ')
			})(),
			merit: Number(items[i + 3].str),
			...(() => {
				const [department, university] = items[i + 4].str.split('-')
				return { department, university }
			})()
		}
		arr.push(obj)
	}
	return arr
}

async function parsePdf(fileBufferArray) {
	const loadingTask = pdfjs.getDocument({ data: fileBufferArray })
	const loadedPdf = await loadingTask.promise

	const resultArr = []
	for (let i = 1; i <= loadedPdf.numPages; i++) {
		resultArr.push(...(await parsePage(i, loadedPdf)))
	}

	return resultArr
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const providedPath = await rl.question('Enter file path: ')
rl.close()

if (!fs.existsSync(providedPath)) throw "The path you provided doesn't exist."
if (!fs.statSync(providedPath).isFile || path.extname(providedPath) !== '.pdf') throw 'The path you provided is not a path of pdf a file.'

fs.rmSync('./data', { recursive: true, force: true })
fs.mkdirSync('./data/spreadsheet', { recursive: true })
fs.mkdirSync('./data/json', { recursive: true })

const data = await parsePdf(new Uint8Array(fs.readFileSync(providedPath)))
const grouped = {}
data.forEach(el => {
	if (!grouped[el.university]) grouped[el.university] = {}
	if (!grouped[el.university][el.department]) grouped[el.university][el.department] = []
	grouped[el.university][el.department].push(el)
})

fs.writeFileSync('./data/json/_all.json', JSON.stringify(data, null, 2))
fs.writeFileSync('./data/json/all.grouped.json', JSON.stringify(grouped, null, 2))

fs.writeFileSync('./data/spreadsheet/_all.csv', jsonToCSV(data))
for (const university in grouped) {
	for (const department in grouped[university]) {
		fs.writeFileSync(`./data/spreadsheet/${university}_${department}.csv`, jsonToCSV(grouped[university][department]))
	}
}
