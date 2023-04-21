function calculateChinesePercentage(inputString) {
  const chineseCharacters = inputString.match(/[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufa2d\u2f800-\u2fa1d\u3000-\u303F]+/g) || [];
  const chineseCharacterCount = chineseCharacters.reduce((total, charGroup) => total + charGroup.length, 0);
  const percentage = (chineseCharacterCount / inputString.length) * 100;
  return percentage;
}


module.exports = { calculateChinesePercentage };
