process.on('unhandledRejection', (reason) => {
  console.error("Unhandled Rejection:", reason);
});
async function run() {
  const slowPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("late rejection")), 100));
  try {
    await Promise.race([
      slowPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 50))
    ]);
  } catch (err) {
    console.log("caught race:", err.message);
  }
  setTimeout(() => console.log("done"), 200);
}
run();
