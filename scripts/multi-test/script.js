// Multi Test script: emits multiple files to download
function main() {
  const items = [];
  for (let i = 1; i <= 5; i++) {
    const url = `https://picsum.photos/seed/icnx_${i}/800/600`;
    items.push({
      url,
      filename: `random_${i}.jpg`,
      title: `Random Image ${i}`,
      type: 'image',
      headers: { 'User-Agent': 'ICNX-Test/1.0' }
    });
  }
  emit({ dir: 'tests/multi', items });
}

main();


