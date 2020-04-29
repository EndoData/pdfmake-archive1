import PDFDocument from './PDFDocument';
import LayoutBuilder from './LayoutBuilder';
import SVGMeasure from './SVGMeasure';
import { normalizePageSize, normalizePageMargin } from './PageSize';
import { tableLayouts } from './tableLayouts';
import Renderer from './Renderer';
import { isFunction, isNumber, isBoolean, isValue } from './helpers/variableType';

/**
 * Printer which turns document definition into a pdf
 *
 * @example
 * var fontDescriptors = {
 *	Roboto: {
 *		normal: 'fonts/Roboto-Regular.ttf',
 *		bold: 'fonts/Roboto-Medium.ttf',
 *		italics: 'fonts/Roboto-Italic.ttf',
 *		bolditalics: 'fonts/Roboto-MediumItalic.ttf'
 *	}
 * };
 *
 * var printer = new PdfPrinter(fontDescriptors);
 */
class PdfPrinter {

	/**
	 * @param {object} fontDescriptors font definition dictionary
	 */
	constructor(fontDescriptors) {
		this.fontDescriptors = fontDescriptors;
	}

	/**
	 * Executes layout engine for the specified document and renders it into a pdfkit document
	 * ready to be saved.
	 *
	 * @param {object} docDefinition
	 * @param {object} options
	 * @returns {object} a pdfKit document object which can be saved or encode to data-url
	 */
	createPdfKitDocument(docDefinition, options = {}) {
		docDefinition.version = docDefinition.version || '1.3';
		docDefinition.compress = isBoolean(docDefinition.compress) ? docDefinition.compress : true;
		docDefinition.images = docDefinition.images || {};
		docDefinition.pageMargins = isValue(docDefinition.pageMargins) ? docDefinition.pageMargins : 40;

		let pageSize = normalizePageSize(docDefinition.pageSize, docDefinition.pageOrientation);

		let pdfOptions = {
			size: [pageSize.width, pageSize.height],
			pdfVersion: docDefinition.version,
			compress: docDefinition.compress,
			userPassword: docDefinition.userPassword,
			ownerPassword: docDefinition.ownerPassword,
			permissions: docDefinition.permissions,
			fontLayoutCache: isBoolean(options.fontLayoutCache) ? options.fontLayoutCache : true,
			bufferPages: options.bufferPages || false,
			autoFirstPage: false,
			font: null
		};

		this.pdfKitDoc = new PDFDocument(this.fontDescriptors, docDefinition.images, pdfOptions);
		setMetadata(docDefinition, this.pdfKitDoc);

		const builder = new LayoutBuilder(pageSize, normalizePageMargin(docDefinition.pageMargins), new SVGMeasure());

		builder.registerTableLayouts(tableLayouts);
		if (options.tableLayouts) {
			builder.registerTableLayouts(options.tableLayouts);
		}

		let pages = builder.layoutDocument(docDefinition.content, this.pdfKitDoc, docDefinition.styles || {}, docDefinition.defaultStyle || { fontSize: 12, font: 'Roboto' }, docDefinition.background, docDefinition.header, docDefinition.footer, docDefinition.watermark, docDefinition.pageBreakBefore);
		let maxNumberPages = docDefinition.maxPagesNumber || -1;
		if (isNumber(maxNumberPages) && maxNumberPages > -1) {
			pages = pages.slice(0, maxNumberPages);
		}

		// if pageSize.height is set to Infinity, calculate the actual height of the page that
		// was laid out using the height of each of the items in the page.
		if (pageSize.height === Infinity) {
			let pageHeight = calculatePageHeight(pages, docDefinition.pageMargins);
			this.pdfKitDoc.options.size = [pageSize.width, pageHeight];
		}

		const renderer = new Renderer(this.pdfKitDoc, options.progressCallback);
		renderer.renderPages(pages);

		return this.pdfKitDoc;
	}
}

function setMetadata(docDefinition, pdfKitDoc) {
	// PDF standard has these properties reserved: Title, Author, Subject, Keywords,
	// Creator, Producer, CreationDate, ModDate, Trapped.
	// To keep the pdfmake api consistent, the info field are defined lowercase.
	// Custom properties don't contain a space.
	function standardizePropertyKey(key) {
		let standardProperties = ['Title', 'Author', 'Subject', 'Keywords',
			'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped'];
		let standardizedKey = key.charAt(0).toUpperCase() + key.slice(1);
		if (standardProperties.includes(standardizedKey)) {
			return standardizedKey;
		}

		return key.replace(/\s+/g, '');
	}

	pdfKitDoc.info.Producer = 'pdfmake';
	pdfKitDoc.info.Creator = 'pdfmake';

	if (docDefinition.info) {
		for (let key in docDefinition.info) {
			let value = docDefinition.info[key];
			if (value) {
				key = standardizePropertyKey(key);
				pdfKitDoc.info[key] = value;
			}
		}
	}
}

function calculatePageHeight(pages, margins) {
	function getItemHeight(item) {
		if (isFunction(item.item.getHeight)) {
			return item.item.getHeight();
		} else if (item.item._height) {
			return item.item._height;
		} else {
			// TODO: add support for next item types
			return 0;
		}
	}

	function getBottomPosition(item) {
		let top = item.item.y;
		let height = getItemHeight(item);
		return top + height;
	}

	let fixedMargins = normalizePageMargin(margins || 40);
	let height = fixedMargins.top;

	pages.forEach(page => {
		page.items.forEach(item => {
			let bottomPosition = getBottomPosition(item);
			if (bottomPosition > height) {
				height = bottomPosition;
			}
		});
	});

	height += fixedMargins.bottom;

	return height;
}

export default PdfPrinter;