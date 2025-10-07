import re
from datetime import datetime, timedelta

def simplify_rule(file_path, output_path):
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    keywords = set()
    suffixes = set()
    hosts = set()
    cidrs = set()
    others = set()

    for line in lines:
        l = line.strip()
        if not l or l.startswith("#"):
            continue
        if l.startswith("HOST-KEYWORD,"):
            keywords.add(l)
        elif l.startswith("HOST-SUFFIX,"):
            suffixes.add(l)
        elif l.startswith("HOST,"):
            hosts.add(l)
        elif l.startswith("IP-CIDR,"):
            cidrs.add(l)
        else:
            others.add(l)

    # 统计
    count_host = len(hosts)
    count_keyword = len(keywords)
    count_suffix = len(suffixes)
    count_cidr = len(cidrs)
    count_other = len(others)
    total = count_host + count_keyword + count_suffix + count_cidr + count_other

    # 更新时间（UTC+8东八区，可以自定义调整本地时区）
    now = datetime.utcnow() + timedelta(hours=8)
    update_time = now.strftime('%Y-%m-%d %H:%M:%S UTC+8')

    # 输出
    with open(output_path, "w", encoding="utf-8") as out:
        out.write(f"# 简化后的规则，自动去重分组\n")
        out.write(f"# HOST: {count_host} | HOST-KEYWORD: {count_keyword} | HOST-SUFFIX: {count_suffix} | IP-CIDR: {count_cidr} | 其他: {count_other} | TOTAL: {total}\n")
        out.write(f"# Last Update: {update_time}\n\n")

        out.write("# HOST\n")
        for h in sorted(hosts): out.write(f"{h}\n")
        out.write("\n# HOST-KEYWORD\n")
        for k in sorted(keywords): out.write(f"{k}\n")
        out.write("\n# HOST-SUFFIX\n")
        for s in sorted(suffixes): out.write(f"{s}\n")
        out.write("\n# IP-CIDR\n")
        for c in sorted(cidrs): out.write(f"{c}\n")
        out.write("\n# 其他类型规则\n")
        for o in sorted(others): out.write(f"{o}\n")

if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 3:
        simplify_rule(sys.argv[1], sys.argv[2])
    else:
        simplify_rule("rules/Prodcust.list", "rules/Prodcust.simplified.list")
