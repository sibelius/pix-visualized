import type { Chapter } from "./types";
import { architecture } from "./architecture";
import { qrcode } from "./qrcode";
import { dict } from "./dict";
import { iso } from "./iso";
import { spi } from "./spi";
import { returns } from "./returns";
import { contapi } from "./contapi";
import { icom } from "./icom";
import { xmldsig } from "./xmldsig";
import { certs } from "./certs";
import { api } from "./api";
import { automatico } from "./automatico";
import { med } from "./med";
import { beyond } from "./beyond";

export const CHAPTERS: Chapter[] = [architecture, qrcode, dict, iso, spi, returns, contapi, icom, xmldsig, certs, api, automatico, med, beyond];
