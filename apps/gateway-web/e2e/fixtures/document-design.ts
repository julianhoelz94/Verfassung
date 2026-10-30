export function documentDesign(element: Element) {
  const typography = (node: Element) => {
    const style = getComputedStyle(node);
    return { family: style.fontFamily, size: style.fontSize, leading: style.lineHeight, weight: style.fontWeight, color: style.color, tracking: style.letterSpacing };
  };
  const paragraph = element.querySelector('.constitution-body')!;
  const style = getComputedStyle(paragraph);
  return { body: typography(element), heading: typography(element.querySelector('h2')!), paragraph: typography(paragraph),
    paragraphSpacing: [style.marginBlockStart, style.marginBlockEnd],
    measure: getComputedStyle(element.closest('[data-constitution-document]')!).maxWidth };
}
