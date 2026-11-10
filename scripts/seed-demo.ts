import { getDemoRepository } from "../src/lib/db/demo/repository";

const STARTER_NAMES = ["Yusuf", "Yunus", "Burak", "İsmail"];

async function main() {
  const repo = getDemoRepository();
  const existing = await repo.persons.list();
  if (existing.length > 0) {
    console.log(`Demo veritabanında zaten ${existing.length} kişi var, tohumlama atlandı.`);
    return;
  }
  for (const name of STARTER_NAMES) {
    await repo.persons.create({ name });
  }
  console.log(`Başlangıç kişileri oluşturuldu: ${STARTER_NAMES.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
