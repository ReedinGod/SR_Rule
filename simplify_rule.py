# 简化 rules/Prodcust.list 的基础脚本
import re

def simplify_rule(file_path, output_path):
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    
    rules = set()
    keywords = set()
    suffixes = set()
    cidrs = set()
    others = set()
    
    for line in lines:
        line = line.strip()
        # 跳过注释与空行
        if not line or line.startswith("#"):
            continue
        if line.startswith("HOST-KEYWORD,"):
            keywords.add(line)
        elif line.startswith("HOST-SUFFIX,"):
            suffixes.add(line)
        elif line.startswith("IP-CIDR,"):
            cidrs.add(line)
        else:
            others.add(line)
    
    with open(output_path, "w", encoding="utf-8") as out:
        out.write("# 简化后的规则，自动去重分组\n")
        out.write("\n# HOST-KEYWORD\n")
        for k in sorted(keywords):
            out.write(f"{k}\n")
        out.write("\n# HOST-SUFFIX\n")
        for s in sorted(suffixes):
            out.write(f"{s}\n")
        out.write("\n# IP-CIDR\n")
        for c in sorted(cidrs):
            out.write(f"{c}\n")
        out.write("\n# 其他类型规则\n")
        for o in sorted(others):
            out.write(f"{o}\n")
