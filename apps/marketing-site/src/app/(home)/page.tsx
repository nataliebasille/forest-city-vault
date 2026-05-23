import Image from "next/image";
import elementBox from "@/ui/icons/elementbox.svg";
import Icon from "@/components/Icon";

export default async function Home() {
  return (
    <main className="min-h-screen">
      <section className="relative min-h-[92vh] overflow-hidden">
        <header className="border-b border-light-surface-800">
          <Icon
            src={elementBox}
            width={250}
            height={150}
            className="text-light-surface-100"
          />
        </header>
        <Image
          src="/images/fvc-hero.jpeg"
          alt="forest city vault community market place -z-1"
          fill
          priority
          className="object-cover opacity-80"
          sizes="100vw"
        />
      </section>
    </main>
  );
}
