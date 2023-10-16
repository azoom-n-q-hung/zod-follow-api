import { isHiragana, toKatakana, toHiragana } from 'wanakana'
import { isKanaCharacters } from '@root/util'

export function convertKanaToOthersCharacter(text: string) {
  const kataKanaCharacters = isHiragana(text) ? toKatakana(text) : text

  return {
    kataKanaCharacters: kataKanaCharacters,
    hiraganaCharacters: isKanaCharacters(text) ? toHiragana(text) : text,
    halfWidthKatakana: isHiragana(text)
      ? fullToHalfWidth(kataKanaCharacters)
      : text
  }
}

const KANA_ZEN_TO_HAN_MAP: any = {
  ァ: 'ｧ',
  ア: 'ｱ',
  ィ: 'ｨ',
  イ: 'ｲ',
  ゥ: 'ｩ',
  ウ: 'ｳ',
  ェ: 'ｪ',
  エ: 'ｴ',
  ォ: 'ｫ',
  オ: 'ｵ',
  カ: 'ｶ',
  ガ: 'ｶﾞ',
  キ: 'ｷ',
  ギ: 'ｷﾞ',
  ク: 'ｸ',
  グ: 'ｸﾞ',
  ケ: 'ｹ',
  ゲ: 'ｹﾞ',
  コ: 'ｺ',
  ゴ: 'ｺﾞ',
  サ: 'ｻ',
  ザ: 'ｻﾞ',
  シ: 'ｼ',
  ジ: 'ｼﾞ',
  ス: 'ｽ',
  ズ: 'ｽﾞ',
  セ: 'ｾ',
  ゼ: 'ｾﾞ',
  ソ: 'ｿ',
  ゾ: 'ｿﾞ',
  タ: 'ﾀ',
  ダ: 'ﾀﾞ',
  チ: 'ﾁ',
  ヂ: 'ﾁﾞ',
  ッ: 'ｯ',
  ツ: 'ﾂ',
  ヅ: 'ﾂﾞ',
  テ: 'ﾃ',
  デ: 'ﾃﾞ',
  ト: 'ﾄ',
  ド: 'ﾄﾞ',
  ナ: 'ﾅ',
  ニ: 'ﾆ',
  ヌ: 'ﾇ',
  ネ: 'ﾈ',
  ノ: 'ﾉ',
  ハ: 'ﾊ',
  バ: 'ﾊﾞ',
  パ: 'ﾊﾟ',
  ヒ: 'ﾋ',
  ビ: 'ﾋﾞ',
  ピ: 'ﾋﾟ',
  フ: 'ﾌ',
  ブ: 'ﾌﾞ',
  プ: 'ﾌﾟ',
  ヘ: 'ﾍ',
  ベ: 'ﾍﾞ',
  ペ: 'ﾍﾟ',
  ホ: 'ﾎ',
  ボ: 'ﾎﾞ',
  ポ: 'ﾎﾟ',
  マ: 'ﾏ',
  ミ: 'ﾐ',
  ム: 'ﾑ',
  メ: 'ﾒ',
  モ: 'ﾓ',
  ャ: 'ｬ',
  ヤ: 'ﾔ',
  ュ: 'ｭ',
  ユ: 'ﾕ',
  ョ: 'ｮ',
  ヨ: 'ﾖ',
  ラ: 'ﾗ',
  リ: 'ﾘ',
  ル: 'ﾙ',
  レ: 'ﾚ',
  ロ: 'ﾛ',
  ヮ: '',
  ワ: 'ﾜ',
  ヲ: 'ｦ',
  ン: 'ﾝ',
  ヴ: 'ｳﾞ',
  '・': '･',
  ー: '-',
  '。': '.',
  '「': '｢',
  '」': '｣'
}

export function fullToHalfWidth(str: string) {
  if (typeof str !== 'string') return str

  return str
    .split('')
    .map((char: string) => {
      const mappedChar = KANA_ZEN_TO_HAN_MAP[char]

      return typeof mappedChar !== 'undefined' ? mappedChar : char
    })
    .join('')
}

export function halfToFullWidth(str: string) {
  if (typeof str !== 'string') return str

  return str.normalize('NFKC')
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('ja-JP').format(price)
}
