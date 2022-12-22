import { promises as fs } from "fs";
import snake from "to-snake-case";
import _ from "date-utils";

const today = new Date();
const post_title = snake(process.argv[2]);
const genPath = `src/pages/blog/${today.toFormat("YYYY/MM/DD")}/${post_title}`;
const fileName = `index.mdx`;
const postPath = `./${genPath}/${fileName}`;

const frontMatter = `---
layout: "@layouts/Layout.astro"
title: "${process.argv[2]}"
head: "blog"
date: "${today.toFormat("YYYY-MM-DD")}"
archives: ["${today.toFormat("YYYY/MM")}"]
tags:
  -
---
`;

const fileCheck = async (filepath) => {
  try {
    return !!(await fs.lstat(filepath));
  } catch (e) {
    return false;
  }
};

let fileNotExist;
await fileCheck(postPath).then((res) => {
  fileNotExist = !res;
});

if (fileNotExist) {
  try {
    await fs.mkdir(genPath, { recursive: true }, (err) => {});
    await fs.writeFile(postPath, frontMatter, (err, data) => {});
  } catch (error) {
    console.error(error);
  }
  console.log("Generated: ", postPath);
} else {
  console.log("File existed: ", postPath);
}
